

# Piano: Stima 10K più seria (modello Riegel + normalizzazione per tipo)

## Il problema

L'attuale `computeAdjustedEstimate` fa una proiezione ingenua: prende il pace di una sessione qualsiasi (anche un lento a 9'/km), applica una piccola correzione FC, e moltiplica per 10. Risultato: se hai corso lento, ti stima ~75-85' sui 10K — assurdo, perché in lento NON corri a ritmo gara.

Mancano tre cose:
1. **Conversione tra distanze** (un pace tenuto per 5km è diverso da quello su 10km).
2. **Normalizzazione per tipo di sessione**: un lento a FC 75% e un medio a FC 88% rivelano fitness diverse, non vanno trattati uguale.
3. **Pesatura intelligente**: dare più peso a sessioni recenti, vicine al ritmo gara, e di durata significativa.

## Il nuovo modello

### Step 1 — Stima il **pace gara equivalente** di ogni sessione

Per ogni log non saltato, due correzioni indipendenti:

**A. Correzione per intensità (FC vs ritmo gara)**
Il ritmo gara 10K corrisponde a circa **88-92% FCmax** (zona soglia). Se hai corso al 75% FCmax (lento), il pace della sessione va "scalato" a quello che terreresti al 90%:

```text
hrRaceTarget = hrMax * 0.90
ratio = hrRaceTarget / hrAvgSessione
paceAtRaceHR = paceSessione / ratio^k
```

Dove `k ≈ 1.06` (relazione empirica pace↔FC, derivata da Karvonen). Quindi un lento 9'/km a 75% FCmax → equivalente ~7'00"/km a 90% FCmax. Più onesto.

**B. Correzione per distanza (formula di Riegel)**
La formula standard atletica per estrapolare tempi tra distanze:

```text
T2 = T1 * (D2 / D1)^1.06
```

Esempio: 5km in 30' → 10km in `30 * (10/5)^1.06 = 62.5'`. NON `30 * 2 = 60'`.

### Step 2 — Combina le due correzioni

Per ogni sessione: `estimated10K = paceAtRaceHR * 10 * (10 / distanza)^0.06`. (Il termine Riegel diventa piccolo quando la distanza è già vicina a 10km, grande quando è lontana.)

### Step 3 — Pesa le sessioni

Non tutte le sessioni hanno lo stesso valore predittivo. Peso = prodotto di tre fattori:

- **Tipo**: `quality` 1.0, `medium` 0.9, `long` 0.8, `easy` 0.4. I lenti contano poco perché la correzione FC ha più incertezza a basse intensità.
- **Distanza**: sessioni < 3km pesano 0.5, ≥ 5km pesano 1.0 (più la sessione è lunga, più l'estrapolazione Riegel è affidabile).
- **Recency**: sessioni delle ultime 2 settimane peso 1.0, fino a 4 settimane 0.7, oltre 0.4.

### Step 4 — Confidenza & banda

Calcolo media pesata + deviazione standard delle stime:
- Se ho < 3 sessioni "buone" (peso ≥ 0.5) → stima = `target dichiarato` (non abbastanza dati, mostro "RACCOGLIENDO DATI").
- Se ho ≥ 3 sessioni → stima = media pesata, con un range ±σ.
- Blendo ancora con il target dichiarato (peso 20% target, 80% dati) per stabilità nei primi log.

### Step 5 — Esponi la confidenza in UI

Nel Dashboard, sotto "STIMA INDICATIVA", aggiungo:
- **Valore centrale** (es. ~58')
- **Banda**: "tra 55' e 62'" (se ho dati sufficienti)
- **Etichetta confidenza**: "BASSA" (< 3 sess. buone), "MEDIA" (3-5), "ALTA" (≥ 6 con almeno una quality/medium recente).
- Se confidenza BASSA, scrivo "Servono ancora 2-3 sessioni di qualità per una stima affidabile" invece di un numero finto.

## File toccati

- **`src/lib/pace-engine.ts`**:
  - Riscrivo `computeAdjustedEstimate(logs, profile)` con il modello sopra.
  - Aggiungo `computeEstimateDetail(logs, profile): { estimate, low, high, confidence: 'low'|'medium'|'high', usableSessions: number }`.
  - Le stime ora ritornano anche metadata, non solo un numero.

- **`src/lib/pace-repository.ts`** + **migrazione DB**: aggiungo colonne opzionali `estimate_low`, `estimate_high`, `estimate_confidence` su `plans` per persistere la banda. (Compatibile, default null.)

- **`src/pages/Index.tsx`**: usa `computeEstimateDetail` invece di `computeAdjustedEstimate`, salva i nuovi campi nel piano.

- **`src/components/pace/Dashboard.tsx`**: rendering nuova UI stima (valore + banda + chip confidenza, oppure messaggio "raccogliendo dati").

- **`src/components/pace/AnalysisScreen.tsx`** (sezione "STIMA INDICATIVA"): stesso pattern (banda + confidenza), e disclaimer aggiornato che spieghi in 1 riga il metodo ("Stima basata su Riegel + normalizzazione FC, pesata su sessioni recenti").

- **`supabase/functions/analyze-workout/index.ts`**: il prompt riceve anche `confidence` e la banda, così il coach può dire "siamo ancora in fase di calibrazione" invece di affermare numeri con sicurezza falsa quando ho 1-2 log.

## Cosa NON faccio

- Niente VO2max o modelli fisiologici complessi (Daniels VDOT) — Riegel + correzione FC è il giusto compromesso onestà/semplicità.
- Niente cambio del piano basato sulla nuova stima (resta a parte: l'adattamento del piano è già gestito dal `planAdjustment` del coach).
- Niente storico delle stime (potrebbe arrivare in un round successivo come grafico trend).

