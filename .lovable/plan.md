

# Sul `currentBest`: oggi viene già chiesto, ma è insufficiente. Ecco come lo gestiamo.

## Stato attuale (verificato in codice)

Nel file `src/components/pace/Onboarding.tsx`, allo **Step 1**, viene chiesto all'utente: *"Qual è il tuo miglior tempo recente?"* su una distanza di riferimento (di default i 10K). Il valore viene salvato come `profile.currentBest` (in minuti) e usato per stimare il `targetTime` e i pace zones.

**Quindi: l'utente lo inserisce sempre, non viene ipotizzato.** Il default precompilato è ~50 minuti su 10K — il che, per un principiante che non ha mai corso 10K, è già un'assunzione sbagliata di partenza.

## I problemi reali del current onboarding

1. **Non gestiamo "non lo so"**. Se l'utente non ha mai corso quella distanza, deve mettere un numero a caso. Il piano poi viene costruito su una bugia.
2. **Non chiediamo il volume settimanale attuale** (km/settimana). È il singolo predittore più forte di quanto può reggere un utente. Senza, il lungo progressivo del Fix #1 di prima parte da una stima del tutto astratta.
3. **Non chiediamo il lungo abituale**. Se uno fa già 90' di lungo regolarmente, partire da 58' è troppo cauto. Se non l'ha mai fatto, partire da 58' è già tanto.
4. **`level` è auto-dichiarato** (beginner/intermediate/advanced) ma senza ancore — ognuno si autodefinisce a caso.

## Cosa propongo: 2 domande nuove + gestione "non lo so"

### Modifica #1 — Step 1: rendere `currentBest` opzionale con fallback intelligente

Aggiungiamo una checkbox sotto il campo: *"Non ho mai corso questa distanza / non ricordo il tempo"*.

Se selezionata:
- Nascondiamo il campo numerico.
- Stimiamo `currentBest` da `level` + `weeklyVolume` (vedi sotto) usando una tabella conservativa:
  - beginner + <20km/sett → 10K stimato in 65'
  - beginner + 20-40km/sett → 10K stimato in 58'
  - intermediate + <30km/sett → 10K stimato in 52'
  - intermediate + 30-50km/sett → 10K stimato in 48'
  - advanced + 30-50km/sett → 10K stimato in 44'
  - advanced + >50km/sett → 10K stimato in 40'
- Salviamo un flag `currentBestEstimated: true` in profile, così il piano sa che il dato è incerto e può mostrare disclaimer (es. *"Stima basata su livello e volume — aggiorna dopo la prima sessione test"*).

### Modifica #2 — Nuovo Step 1.5: volume e lungo abituale

Aggiungiamo uno step intermedio (o lo fondiamo nello Step 1) con due domande **fondamentali** per un piano sensato:

- **"Quanti km corri di solito a settimana?"** — slider 0-80 km. Salvato come `profile.weeklyVolume`.
- **"Qual è il lungo più lungo che hai fatto nelle ultime 4 settimane?"** — slider 0-180 minuti. Salvato come `profile.recentLongRun`.

Queste due informazioni cambiano radicalmente il piano:
- `recentLongRun` diventa il **punto di partenza reale** del lungo progressivo del Fix #1, sostituendo la formula `currentBest * 0.45`. Più onesto e personalizzato.
- `weeklyVolume` permette di dimensionare il volume totale settimanale e di **bloccare** automaticamente piani irrealistici (es. se l'utente fa 15km/sett e vuole una mezza in 5 settimane, mostriamo un avviso onesto).

### Modifica #3 — Disclaimer onesto se i dati sono stimati

Sulla Dashboard, sopra la `PlanPhilosophy`, aggiungiamo un piccolo banner condizionale solo se `currentBestEstimated === true`:
> *"Il piano è basato su una stima del tuo livello attuale. Dopo la prima sessione test (es. 10' a ritmo controllato) potrai aggiornarla per affinare i pace target."*

Niente di invasivo, solo trasparenza.

## Modifiche al piano già approvato

Il Fix #1 di prima (lungo progressivo ancorato a `currentBest`) **diventa più solido** con `recentLongRun`:

```text
longStartingMinutes = max(profile.recentLongRun || currentBest * 0.45, 30)
longTargetMinutes   = clamp(currentBest * 0.75, 60, 150)
```

Cioè: parti da quello che l'utente già regge davvero, non da una percentuale ipotetica.

## Schema DB

Servono **2 colonne nuove** sulla tabella `profiles`:
- `weekly_volume INTEGER NULL` (km/sett)
- `recent_long_run INTEGER NULL` (minuti)
- `current_best_estimated BOOLEAN DEFAULT false`

Migrazione semplice, nullable per compatibilità con utenti esistenti. Per i profili esistenti senza questi dati, useremo i fallback derivati da `level` (come da tabella sopra).

## Cosa NON facciamo (per non gonfiare l'onboarding)

- Niente domande su VO₂max, soglia anaerobica, FCmax di campo. Nessun amatore le sa misurare.
- Niente domanda su "infortuni recenti" — è importante ma è materia di un onboarding medico separato (futuro).
- Niente domanda sul terreno (asfalto/trail/pista). Per ora il piano è terrain-agnostic.
- Niente test fisico in app (es. "corri 12' al massimo e dicci la distanza"). Idea buona per uno sprint dedicato, non oggi.

## File toccati

```text
src/components/pace/Onboarding.tsx
  - Step 1: checkbox "non lo so" + fallback estimato
  - nuovo Step 1.5 (o esteso): weeklyVolume + recentLongRun
  - validazione: warning se obiettivo gara troppo ambizioso vs volume attuale

src/lib/pace-engine.ts
  - Profile interface: aggiunti weeklyVolume, recentLongRun, currentBestEstimated
  - estimateCurrentBestFromLevel(level, weeklyVolume): nuova helper per fallback
  - computeLongDuration(): usa recentLongRun come start se disponibile

src/components/pace/Dashboard.tsx
  - banner condizionale "stima — aggiorna dopo prima sessione" se estimated

supabase/migrations/...sql
  - ALTER TABLE profiles ADD COLUMN weekly_volume INTEGER NULL
  - ALTER TABLE profiles ADD COLUMN recent_long_run INTEGER NULL
  - ALTER TABLE profiles ADD COLUMN current_best_estimated BOOLEAN DEFAULT false

src/lib/pace-repository.ts
  - saveProfile/loadProfile: includono i 3 nuovi campi
```

## Ordine di esecuzione consigliato

1. Migrazione DB (additiva, zero rischio).
2. Estensione `Profile` + repository.
3. Onboarding nuovo (con fallback per utenti esistenti).
4. Aggiornamento `pace-engine.ts` (incorpora i nuovi dati nel calcolo del lungo).
5. Banner disclaimer in Dashboard.

Tutto questo **prima** di rilasciare il Fix #1 sul lungo progressivo che avevamo approvato — altrimenti il lungo viene calcolato su `currentBest * 0.45` astratto, che è esattamente il problema che stiamo cercando di non avere.

## Domande aperte

Una sola, la decisione di scope:

**A.** Procediamo con **tutte e 3 le modifiche all'onboarding** prima di toccare il pace engine? (più completo, l'utente test riceve subito un piano migliore)

**B.** Oppure spacchiamo: **prima** Fix #1/#2/#3 sul pace engine già approvato (così l'utente attuale vede subito miglioramenti), **poi** in un secondo round l'estensione dell'onboarding con `weeklyVolume` + `recentLongRun`? (più graduale, ma il primo round ha ancora il `currentBest * 0.45` astratto)

Default se non rispondi: **A** — facciamo bene una volta sola, l'onboarding è il momento giusto per chiedere queste cose senza che sembri intrusivo.

