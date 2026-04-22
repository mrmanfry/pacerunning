

# Due problemi separati, due fix distinti

## Problema 1 — "Errore upload, riprova più tardi"

### Cosa è successo davvero

Dal session replay: hai caricato `IMG_9192.PNG` (estensione **maiuscola**) e dopo ~10ms è apparso il toast "Errore upload, riprova più tardi". Quel toast viene SOLO dal `catch` generico in `LogWorkout.tsx` riga 177 — quindi qualcosa ha throwato prima ancora che l'estrazione partisse, probabilmente nell'upload allo storage.

I log Postgres e i log edge function di `extract-workout-data` sono **vuoti** per quella finestra → la chiamata non è nemmeno arrivata al server. È fallito l'upload su `workout-screenshots`. Le cause più probabili, in ordine:

1. **MIME type non riconosciuto**: il file è `IMG_9192.PNG` (estensione maiuscola). Il browser su iOS/desktop a volte invia `file.type` vuoto per `.PNG` maiuscolo, e Supabase Storage rifiuta upload senza contentType valido con un errore generico.
2. **Rete instabile / timeout** durante l'upload concorrente di 3 file da diversi MB.
3. **File troppo grande**: già controllato a 8MB, quindi escluso.

### Cosa fixiamo

`src/lib/pace-repository.ts` — `uploadWorkoutScreenshot()`:
- Forziamo l'estensione **lowercase** prima di costruire il path (`.PNG` → `.png`).
- Se `file.type` è vuoto o non inizia con `image/`, **deduciamo il MIME dall'estensione** (`png` → `image/png`, `jpg`/`jpeg` → `image/jpeg`, `webp` → `image/webp`, `heic` → `image/heic`).
- Wrappiamo l'errore Supabase con un messaggio più utile (status code + message) invece di throware l'oggetto raw.

`src/components/pace/LogWorkout.tsx` — `handleScreenshot()`:
- Nel `catch` mostriamo il **messaggio reale dell'errore** invece di "Riprova più tardi" generico, così la prossima volta vediamo subito se è MIME, rete o storage policy.
- Toast più chiaro: "Upload fallito: <messaggio>".

Niente nuove tabelle, niente nuove policy. La policy storage esiste già ed è corretta (`{userId}/{file}` con `auth.uid() = foldername[1]`).

## Problema 2 — "Il dashboard mi propone la lunga, io voglio fare la ripetute"

### Come funziona oggi

`findNextSession()` in `pace-engine.ts:815` scorre le settimane e le sessioni **in ordine** e restituisce la **prima non loggata**. Se la tua settimana 1 ha l'ordine `[lunga, ripetute, easy]`, ti propone la lunga.

**Però — buona notizia — non sei costretto a seguirlo.** Il `Dashboard` mostra anche la lista completa delle sessioni della settimana (sezione `plan.weeks[w].sessions` cliccabili). Se clicchi sulla "ripetute" lì, si apre il `SessionDetail` di quella sessione e quando logghi l'allenamento viene salvato con `weekIdx + sessionIdx` corretti. Il sistema accetta sessioni in qualsiasi ordine. La "next" è solo un suggerimento, non un vincolo.

### Cosa cambia per il tuo caso

**Niente codice da cambiare per farlo funzionare** — già funziona così. Quello che cambiamo è la **comunicazione**: oggi la card "Prossima sessione" sembra dire "DEVI fare questa", e la lista settimanale sotto sembra solo informativa.

`src/components/pace/Dashboard.tsx`:
- Sopra la card "PROSSIMA SESSIONE" cambiamo il microcopy: invece di **"PROSSIMA SESSIONE"** scriviamo **"SUGGERITA OGGI"** + sottotitolo *"Puoi fare un'altra sessione della settimana — clicca qui sotto per scegliere."*
- Nella lista settimanale, evidenziamo visivamente che le sessioni sono **tutte** loggabili (badge "DISPONIBILE" sulle non completate, non solo sulla "next").
- Quando clicchi una sessione che NON è la "next" suggerita, il `SessionDetail` mostra un piccolo banner *"Stai per loggare la {nome}. La sessione suggerita era {altra}, ma puoi farla quando vuoi."* — niente blocchi, solo trasparenza.

`src/lib/pace-engine.ts` — `findNextSession()`:
- Nessun cambio di logica. Resta "prima non loggata" come default.

## File toccati

```text
src/lib/pace-repository.ts
  - uploadWorkoutScreenshot(): lowercase ext, MIME inference fallback,
    errore propagato con messaggio leggibile

src/components/pace/LogWorkout.tsx
  - catch dell'upload: toast con messaggio reale invece di
    "Riprova più tardi" generico

src/components/pace/Dashboard.tsx
  - relabeling "PROSSIMA SESSIONE" → "SUGGERITA OGGI" + sottotitolo
  - lista sessioni settimana con badge "DISPONIBILE" sulle non completate

src/components/pace/SessionDetail.tsx
  - banner informativo se l'utente apre una sessione diversa dalla
    "next" suggerita (zero blocchi, solo nota)

NIENTE migrazioni DB. NIENTE modifiche a policy storage. NIENTE modifiche a edge functions.
```

## Domande aperte

Nessuna. Procedo non appena approvi.

