

# Piano: distanza gara configurabile (5K / 10K / 21K / personalizzata)

## Risposta breve

**Fattibile, di media complessità.** Non bisogna riscrivere il piano corsa: la generazione del piano (`generatePlan`) lavora su settimane, frequenza e zone FC, NON sulla distanza gara. Quello che cambia è:

1. **Modello dati** → aggiungere `raceDistance` (km) al profilo.
2. **Matematica della stima** → 4-5 punti dove "10" è hardcoded vanno parametrizzati con `D`.
3. **UI** → onboarding, dashboard, schermata analisi e prompt AI con la distanza scelta.
4. **Template piano** → adattamento minore di durate sessioni "lungo" e "ritmo gara".

Tempo stimato: ~1 sessione di lavoro media. Niente migrazione distruttiva (campo opzionale con default 10).

## Cosa cambia (dettaglio tecnico)

### 1. Dati & onboarding

- **`Profile`** (`src/lib/pace-engine.ts`): aggiungo `raceDistance: number` (km, default 10).
- **DB `profiles`**: nuova colonna `race_distance numeric NOT NULL DEFAULT 10`.
- **`Onboarding.tsx`** step 3: nuovo `SegmentedControl` con preset `5 / 10 / 21.097 / Altro` (con input numerico se "Altro"). Etichette aggiornate ("TEMPO RECENTE SU {D} KM", "TEMPO A CUI PUNTERESTI SU {D} KM").
- **`pace-repository.ts`**: load/save `raceDistance`.

### 2. Motore di stima — generalizzazione 10 → D

In `pace-engine.ts`, sostituire ovunque `10` con `profile.raceDistance`:

- `paceFromTime(totalMinutes, distance)`: `paceMin = totalMinutes / distance` (oggi `/10`).
- `singleSessionEstimate(log, hrMax, raceDist)`:
  - `paceAtRaceHR * raceDist * (raceDist / log.distance)^(RIEGEL_K - 1)` (Riegel resta valida per qualsiasi distanza, fino a ~mezza maratona è molto affidabile; sopra perde un po' ma resta lo standard del settore).
  - Per la maratona (42K), Riegel sovrastima leggermente; aggiungerò un fattore correttivo morbido `+2%` solo se `raceDist > 30`.
- `analyzeWorkout` prediction (`* 10` → `* raceDist`).
- `computeMetrics.targetPaceMin = profile.targetTime / raceDist`.
- **HR target gara**: `0.90 * hrMax` resta corretto per 5K-10K-21K. Per maratona scenderebbe a ~0.85; gestito con piccola tabella se `raceDist >= 30`.

### 3. Generazione piano (`generatePlan`)

Sorpresa positiva: **quasi nulla da cambiare**. Il piano già si basa su zone FC e settimane. Aggiusto solo:

- **Sessione "Lungo lento"**: target durata = `max(60, raceDist * 7)` minuti (così su 5K resta 60', su 10K ~70', su 21K sale a ~90-100'). Cap a 120'.
- **Sessione "Ritmo gara"**: blocchi commisurati. Su 5K → ripetute più brevi e veloci; su 21K → ritmo gara più lungo e meno acuto. Per ora mantengo il template attuale e adatto solo durate; non creo template separati per distanza (sarebbe un round successivo se l'utente vuole piani veramente specifici 5K vs 21K).

### 4. UI

- **Dashboard.tsx**: `TEMPO IPOTETICO {D} KM` (oggi `10 KM`); banda e disclaimer parlano della distanza scelta.
- **AnalysisScreen.tsx**: `STIMA INDICATIVA {D}K`.
- **SessionDetail.tsx**: nessun cambio (parla di zone, non di distanza gara).
- **Edge function `analyze-workout`**: prompt riceve `raceDistance` e usa quella nelle frasi del coach ("sui {D}K", "ritmo gara per {D}K").

### 5. Migrazione DB

```sql
ALTER TABLE public.profiles
  ADD COLUMN race_distance numeric NOT NULL DEFAULT 10;
```

I profili esistenti restano coerenti (10K). Nessuna logica retro-compatibilità extra: i log storici non dipendono dalla distanza gara.

## Cosa NON faccio in questo round

- **Template piano dedicati per distanza** (es: piano 5K diverso da piano 21K). Il template attuale, con le durate "lungo" parametrizzate, copre dignitosamente 5K-21K. Per maratona vera servirebbe un template a sé — lo lascio fuori scope.
- **Scelta unità di misura** (miglia). Resta tutto in km.
- **Multi-gara** (più gare in calendario). Una gara alla volta, come oggi.

## File toccati (riepilogo)

- `src/lib/pace-engine.ts` — parametrizzare `10` → `raceDistance`, adattare `generatePlan` (durata lungo).
- `src/components/pace/Onboarding.tsx` — nuovo selettore distanza + etichette dinamiche.
- `src/components/pace/Dashboard.tsx` — etichette dinamiche.
- `src/components/pace/AnalysisScreen.tsx` — etichette dinamiche.
- `src/lib/pace-repository.ts` — load/save `raceDistance`.
- `src/pages/Index.tsx` — propagazione `raceDistance` dove serve.
- `supabase/functions/analyze-workout/index.ts` — prompt usa la distanza.
- Nuova migrazione SQL — colonna `race_distance` su `profiles`.

## Rischi

- **Riegel su 21K e oltre**: l'errore cresce; è il limite intrinseco del modello, non risolvibile senza VDOT/Daniels (escluso dal piano precedente).
- **Utenti esistenti**: nessun impatto, default 10 = comportamento attuale.

