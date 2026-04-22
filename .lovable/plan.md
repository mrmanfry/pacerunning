

# Fix: i numeri sbagliati erano placeholder, non estrazione

## Cosa è successo davvero (root cause confermata dai DB log)

Confronto fra i log e quello che ti ha mostrato l'app:

| | Estrazione AI (riuscita) | Quello che hai visto |
|---|---|---|
| Durata | **45 min** | 40 min |
| Distanza | **7,59 km** | 5 km |
| FC media | **165 bpm** | 150 bpm |
| FC max | **183 bpm** | 170 bpm |

I numeri che hai visto **non vengono dallo screenshot**: sono i **default placeholder** di `LogWorkout.tsx` (`distance: 5, hrAvg: 150, hrMax: 170`).

Cosa è successo, in ordine:
1. Hai caricato gli screenshot.
2. Hai cliccato "SALVA E LEGGI" **mentre l'estrazione era ancora in corso** (lo spinner girava). Il bottone non era disabilitato → ha salvato i placeholder.
3. La chiamata `analyze-workout` non è mai arrivata al server (zero righe in `ai_requests` per quel log) → l'analisi mostrata è quella **deterministica fallback** di `pace-engine.ts`, calcolata sui placeholder. Da qui "8'00\"/km", "82% FCmax", "intensità leggera", "stimo Z2 anche se è una qualità".
4. Mezzo minuto dopo l'estrazione AI è arrivata pulita (7.59 km, 165 bpm, 30 punti del grafico FC, FC max 183 letta dall'asse Y) ma è arrivata **dopo il submit**, quindi nessuno l'ha usata.

Quindi: il pipeline deep funziona. Quello che non funziona è il **wiring tra estrazione e form**, e il **fallback dell'analisi** non distingue "mancanza di AI" da "campi vuoti", inventando una lettura su numeri inventati.

## Cosa fixiamo

Quattro fix, tutti chirurgici. Niente nuovo prompt, niente nuovi modelli (l'estrazione è ottima così).

### 1. Blocca il salvataggio finché l'estrazione non finisce

`LogWorkout.tsx` — bottone "SALVA E LEGGI" disabilitato se `extracting === true` o se l'utente ha caricato screenshot ma l'estrazione non ha popolato neanche un campo (`extractionMeta == null`). Banner sopra il bottone: "STO LEGGENDO LO SCREENSHOT — aspetta o togli l'immagine per inserire a mano".

### 2. Niente più placeholder visibili

`LogWorkout.tsx` — i campi partono **vuoti** (`null`/`""`), non con `5/150/170`. `MetricCard` mostra "—" come placeholder grigio finché non c'è un valore (manuale o estratto). `canSave` resta `duration > 0 && distance > 0 && hrAvg > 0`. Così se per qualche motivo lo spinner muore senza popolare nulla, l'utente VEDE che mancano i numeri invece di salvare 5/150 silenziosamente.

### 3. Fallback deterministico più onesto

`pace-engine.ts` `analyzeWorkout()` — se i numeri sono palesemente incoerenti col tipo di sessione (es. "quality" con pace 8'/km e RPE 6 → contraddice una ripetuta), l'analisi dice esplicitamente: "I numeri non tornano col tipo di sessione che hai indicato — verifica che durata e distanza siano quelle giuste, oppure cambia il tipo di sessione". Niente più "intensità leggera" silenziosa su una qualità che evidentemente non lo era.

### 4. La chiamata `analyze-workout` deve loggarsi sempre

Oggi se la fetch lato client esplode (es. body troppo grande con `hrSeries` 30 punti + `extractedWorkout` completo) finisce nel `catch` di Index.tsx e passa al fallback, ma non arriva mai al server → zero traccia di cosa è successo. Due cambi:

- `Index.tsx`: nel `catch` mostra un toast esplicito ("Analisi AI fallita: <messaggio>"), così la prossima volta l'utente lo vede subito.
- `Index.tsx`: prima di chiamare `analyze-workout`, **stripa `hrSeries.points` a 12 punti riassuntivi** (passa già la curva ma più compatta) e **rimuove `paceSeries`** dal payload del coach. Il coach non ha bisogno della granularità completa per commentare — gli bastano segments + kmSplits + un riassunto dell'andamento. La curva piena resta in DB nella tabella `workout_extractions` per la UI.

### 5. Il coach DEVE leggere i blocchi della sessione pianificata

Oggi `analyze-workout` riceve `nextPlanned.blocks` (i 4 step "10' riscaldamento → 5x3' alta → recupero 2' → 10' defaticamento") MA come `nextPlanned`, cioè la **prossima sessione**, non quella appena fatta. La sessione appena loggata invece arriva solo come `log.sessionType: "quality"` + `log.sessionName`, senza i blocchi.

Fix in `Index.tsx`: aggiungiamo `currentPlanned: { name, type, duration, targetHR, blocks }` al payload, prendendo i blocchi dalla sessione ESATTA che è stata loggata (`plan.weeks[log.weekIdx].sessions[log.sessionIdx]`).

Fix in `analyze-workout/index.ts`: nuovo blocco prompt `<plan_vs_execution>` che:
- riceve `<plannedSession>` con i blocchi ("5 blocchi di 3' a 169-179 bpm, recuperi di 2'")
- riceve `<segments>` con quello che hai effettivamente fatto (10:01 riscaldamento, R1=3'00"@171, REC=2'00"@166, R2=3'00"@173...)
- istruzione esplicita: "Leggi la sessione PER BLOCCHI, non come totale. Per ogni ripetuta confronta esecuzione vs target FC e di' se è in banda. NON ridurre tutto a 'intensità leggera' guardando solo la media."
- popola `segmentReadings` con un commento per ogni ripetuta.

## Cosa NON tocchiamo

- Estrazione (`extract-workout-data`): funziona benissimo, 7.59 km e 30 punti del grafico FC letti correttamente.
- Schema DB: già ha `segment_readings` jsonb da prima.
- UI di `AnalysisScreen` / `SessionDetail`: già renderizza `SegmentTimeline` e `HrSparkline` quando i dati ci sono.
- Modelli AI: restano `gemini-2.5-flash` (triage) + `gemini-2.5-pro` (deep) + `gemini-3-flash-preview` (coach). Niente upgrade, è un problema di payload e di prompt, non di modello.

## File toccati

```text
src/components/pace/LogWorkout.tsx
  - default fields → null/""
  - bottone SALVA disabilitato se extracting o screenshot caricati senza extractionMeta
  - banner "stiamo leggendo, aspetta"

src/pages/Index.tsx
  - aggiunge currentPlanned al payload di analyze-workout
  - stripa hrSeries.points a 12 prima di inviare
  - rimuove paceSeries dal payload coach
  - toast esplicito su catch della fetch coach

src/lib/pace-engine.ts
  - analyzeWorkout(): se sessione "quality" + RPE basso + pace molto sopra target → 
    verdetto "i numeri non tornano col tipo di sessione" invece di lettura silenziosa

supabase/functions/analyze-workout/index.ts
  - PROMPT_VERSION bump (v5-2026-04-22-segments)
  - nuovo blocco system <plan_vs_execution>
  - buildUserPrompt riceve currentPlanned e lo formatta come <plannedSession>
  - istruzione: leggi PER BLOCCHI quando segments presenti, non come totale

NIENTE migrazioni DB.
```

## Domande aperte

Una sola, decisivamente:

**A. Il submit con estrazione in corso:** lo blocchiamo (mostro spinner, bottone disabled finché non finisce) — opzione pulita ma se l'estrazione si pianta l'utente non può salvare. Fallback: dopo 30s di estrazione bloccata, abilito comunque il bottone e mostro avviso "estrazione lenta, vuoi salvare lo stato attuale?". OK così?

