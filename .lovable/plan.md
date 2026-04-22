

# Piano rivisto — 3 fix UI + prompt, con i ritocchi che hai chiesto

## Fix #1 — Mostra segments, splits e curva FC in `AnalysisScreen`

I dati ci sono già in `extractedWorkout` (13 segments, 7 kmSplits, hrSeries, segmentReadings). Li renderizziamo.

**Cosa renderizziamo, e come decidiamo cosa è "interessante":**

- **`<SegmentTimeline>`**: mostriamo SOLO segmenti di tipo `interval` e `recovery`. Filtriamo via `warmup` / `cooldown` / `other` / `steady` perché ingombrano e raramente meritano un commento. Se restano > 6 segmenti totali, mostriamo i primi 4 espansi e gli altri dentro un accordion `<Collapsible>` ("Mostra altre N ripetute").
- **`segmentReadings`**: aggiunti sotto la barra del segmento solo per gli `interval` filtrati. Se l'AI ha scritto un reading per un `recovery`, lo ignoriamo in UI (resta in DB).
- **Tabella `kmSplits`**: nuova sezione "PARZIALI PER KM" sotto la timeline, una riga per km con `pace` e `hrAvg`. Compatta, mono-font, stile coerente.
- **`<HrSparkline>`**: già esistente, lo montiamo se `hrSeries.points.length >= 6`.

**Verifica `<SegmentTimeline>` come hai chiesto:** il componente esiste in `src/components/pace/SegmentTimeline.tsx` (l'ho letto: 90 righe, completo, gestisce KIND_LABEL, KIND_COLOR, fmtDuration, fmtPace, accetta `segments` + `segmentReadings` opzionali, già renderizza la barra proporzionale + reading sotto). Non è uno scheletro — è funzionante. **Ma non è mai stato montato in nessun render** finora (cerca usages: zero match). Quindi questo fix è la sua prima istanza in produzione: aspettati di dover sistemare 1-2 dettagli di styling al primo passaggio in default mode, ma non riscritture.

## Fix #2 — `SessionDetail` per sessioni passate: solo lettura, niente prescrizione

Recepisco la tua decisione finale: **niente `nextMove` nelle sessioni passate**. Solo `technicalReading` + `sessionHighlight`.

In `SessionDetail`, sezione "QUESTA SESSIONE / STORICO COACH":
- Mostriamo **`technicalReading`** (header: "LETTURA TECNICA") + **`sessionHighlight`** (header: "HIGHLIGHT").
- **Rimuoviamo del tutto la riga `nextMove`** dal render delle analisi storiche. Resta in DB (`workout_analyses.next_move`) per uso futuro ma non viene mai mostrato qui.
- Aggiungiamo sotto la `<SegmentTimeline>` filtrata come al Fix #1, con i `segment_readings` salvati su `workout_analyses` per quel log.

`nextMove` resta visibile **solo nella Dashboard** come "prossimo passo attivo" (lì è coerente: è il consiglio per la prossima sessione da fare). E in `AnalysisScreen` subito dopo il salvataggio (lì il consiglio operativo è ancora "fresco").

## Fix #3 — Coach: leggi per blocchi quando ci sono ≥2 `interval`, indipendentemente dal type

In `supabase/functions/analyze-workout/index.ts`:

- **`PROMPT_VERSION`** → `v6-2026-04-22-segments-typeagnostic`. (Già salvato per record su `workout_analyses.prompt_version` — verificato dallo schema. Il "buco architetturale" del logging prompt che hai citato in realtà è chiuso lato persistenza; quello che manca è uno storico versionato dei testi, ma è scope futuro, non lo apro adesso.)
- Modifica al blocco `<plan_vs_execution>`: trigger su **"≥2 segments di tipo `interval` nei dati ricevuti"**, non su `currentPlanned.type === "quality"`.
- Nuova regola esplicita: se `currentPlanned.type` ∈ `{easy, long, medium}` ma trovi `≥2 interval`, scrivi in `technicalReading`: *"Il piano oggi prevedeva [tipo], ma negli screenshot vedo N ripetute strutturate — hai eseguito una sessione diversa da quella pianificata."*
- Popola `segmentReadings` con un commento per ogni `interval` (l'UI poi filtra/collassa, ma il coach scrive su tutti).

**Sul tuo punto opzionale "spostare il commento nella slot di quality della settimana":** non lo faccio in questa iterazione. Comporta logica di "rebinding" del log a un'altra session_idx, che è esattamente il tipo di magia silenziosa che rompe la fiducia dell'utente sul "dove finiscono i miei dati". Resta come idea per uno sprint futuro dedicato al "session reassignment".

## Cosa NON tocchiamo (confermato)

- Estrazione `extract-workout-data`: invariata, funziona.
- Schema DB: nessuna migrazione.
- Chip "INTENSITÀ: media" sopra la lettura tecnica: lo lascio per ora — è un fix di coerenza minore che tratterei in un giro dedicato sul label deterministico (calcolato da `computeMetrics`), insieme ad altri micro-fix di copy. Non vale aprirlo qui dentro.
- `findNextSession`: invariata.
- Modelli AI: invariati.

## File toccati

```text
src/components/pace/AnalysisScreen.tsx
  - render <SegmentTimeline> filtrata (solo interval + recovery, accordion >6)
  - render <HrSparkline> se hrSeries.points >= 6
  - tabella PARZIALI PER KM da kmSplits

src/components/pace/SessionDetail.tsx
  - storico coach: solo technicalReading + sessionHighlight
  - rimosso render di nextMove dalle sessioni passate
  - <SegmentTimeline> filtrata anche qui per le sessioni completate

supabase/functions/analyze-workout/index.ts
  - PROMPT_VERSION → v6-2026-04-22-segments-typeagnostic
  - <plan_vs_execution>: trigger su ≥2 interval, non su type=quality
  - regola: se type pianificato ≠ esecuzione (interval rilevati su slot easy/long/medium),
    dichiaralo esplicitamente in technicalReading
  - popola segmentReadings su tutti gli interval

NIENTE migrazioni DB. NIENTE modifiche a extract-workout-data. NIENTE rebinding di session_idx.
```

## Domande aperte

Nessuna. Procedo non appena approvi.

