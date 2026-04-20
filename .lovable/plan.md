

# Piano: AI Reale (Cap. 3) + Foto Apple Salute + Calendario gara

Tre cambi che si combinano per chiudere il loop "Onboarding → Allenamento → AI → Adattamento del piano".

## 1. Onboarding: data della gara invece di "giorni mancanti"

**Problema:** chi inserisce 18-20 giorni alla gara riceve solo 2 settimane di piano (`Math.floor(18/7) = 2`). Il piano viene tagliato senza gestire le fasi correttamente.

**Soluzione:**
- In `Onboarding.tsx` step 3: sostituire `NumberInput` "GIORNI ALLA GARA" con un date picker (input `type="date"` stilizzato) → "DATA DELLA GARA".
- Calcolo automatico di `daysUntilRace = Math.ceil((raceDate - today) / 86400000)` salvato in profilo.
- Aggiungo `raceDate` (date) in `profiles` (migrazione DB) e nel tipo `Profile`.
- Mostrare in UI "Mancano X giorni / Y settimane" sotto il date picker, così l'utente capisce cosa sta scegliendo.

**Generazione piano più realistica** in `generatePlan`:
- ≥ 6 settimane: piano completo (BASE → COSTRUZIONE → INTENSITÀ → TAPER).
- 4-5 settimane: BASE → INTENSITÀ → SPECIFICITÀ → TAPER.
- 3 settimane: INTENSITÀ → SPECIFICITÀ → TAPER (con avviso "tempi stretti, approccio conservativo").
- 2 settimane: SPECIFICITÀ → TAPER + banner sul Dashboard "preparazione molto breve, target da considerare orientativo".
- < 14 giorni: blocchiamo la generazione tradizionale e mostriamo solo TAPER + gara, con banner che invita a ridimensionare il target o spostare la gara.

## 2. Log Allenamento: upload screenshot Apple Salute / Strava / Garmin

**UI in `LogWorkout.tsx`:**
- Nuova sezione in alto "📸 IMPORTA DA SCREENSHOT" con bottone "Scegli foto" (input file `accept="image/*"` + `capture` su mobile).
- Preview thumbnail dell'immagine caricata + spinner "Sto leggendo i dati...".
- L'AI estrae automaticamente: durata, distanza, FC media, FC max, cadenza. L'utente può poi correggere a mano i valori prima di salvare.
- Storage: bucket Supabase `workout-screenshots` privato (RLS: solo proprietario), path `{user_id}/{timestamp}.jpg`.

**Edge function `extract-workout-data`:**
- Riceve l'URL signed dell'immagine + il `sessionType` selezionato.
- Chiama Lovable AI con `google/gemini-3-flash-preview` (multimodale, gratuito), system prompt: "Estrai SOLO i numeri visibili nello screenshot di un app fitness. Non inventare valori."
- Output strutturato via tool calling con schema rigido `{ duration, distance, hrAvg, hrMax, cadence }` (tutti opzionali, `null` se non visibili).
- Pre-popola i campi del form. L'utente vede chiaramente quali campi sono stati riempiti dall'AI (badge "AUTO" sul campo).

## 3. Motore Descrittivo IA reale (Cap. 3, "sandwich")

**Sostituisco** la funzione deterministica `analyzeWorkout` con una vera chiamata AI, mantenendo l'approccio sandwich del Cap. 3.2.

**Nuova edge function `analyze-workout`:**
- **Strato 1 (codice):** calcoli matematici fatti localmente prima di chiamare l'AI.
  - `paceMinKm`, `paceFormatted` (MM:SS/km).
  - `hrPctMax`, `hrPctReserve` (Karvonen con FC riposo stimata 60).
  - `intensityZone` (Z1-Z5 secondo % FC max).
  - Riassunti degli ultimi 3 allenamenti dello **stesso tipo** (Cap. 5.3 — context window controllato).
  - Confronto con `targetTime`: ritmo gara teorico vs ritmo della sessione.
- **Strato 2 (AI):** prompt ricco di numeri pre-calcolati, mai chiede all'AI di calcolare.
- **System prompt blindato (Cap. 4.2):**
  - Identità: "Analista dati sportivi per app wellness amatoriale, non medico."
  - Vietato: diagnosticare, prescrivere riposo medico, "devi correre a X".
  - Lessico condizionale obbligatorio: "le metriche suggeriscono", "i dati indicano".
  - De-escalation: dolore/sintomi → solo invito a consulto medico.
- **Tool calling per output strutturato** (evita parse di markdown):
  ```
  {
    technicalReading: string,    // "Lettura Tecnica" Cap. 3.4
    sessionHighlight: string,    // "Highlight"
    nextMove: string,            // "Spunto Operativo"
    planAdjustment: {            // NUOVO: adattamento del piano
      shouldAdjust: boolean,
      reason: string,
      newTargetEstimate: number | null,  // minuti
      message: string
    }
  }
  ```
- **Guardrail post-API (Cap. 4.3):** scan parole vietate (`sindrome`, `patologia`, `prescrivo`, `devi assolutamente`, `diagnosi`). Match → fallback hard-coded.
- **Calcoli matematici nell'output:** pace, FC %, intensityLabel restano calcolati in codice e passati a `AnalysisScreen` insieme ai testi AI.

**Adattamento realistico del piano (loop di feedback):**
- L'AI valuta lo scostamento target vs realtà di tutti i log e popola `planAdjustment`.
- Se `shouldAdjust=true` e `newTargetEstimate` è significativamente diverso dal target (>3 min): mostriamo banner nel Dashboard "L'analisi suggerisce un target più realistico: X. Vuoi aggiornarlo?" con bottone Accetta/Ignora.
- L'utente accetta → aggiorniamo `profile.targetTime` e rigeneriamo `plan.adjustedEstimate`. La struttura del piano non cambia automaticamente per non rompere lo storico, ma le sessioni TAPER ricalcolano il pace gara.

## 4. Aggiornamenti DB

Migrazione:
- `profiles`: aggiungere `race_date date`.
- Bucket storage `workout-screenshots` (privato) + RLS policy "solo proprietario può vedere/upload/cancellare i propri file".
- Edge functions: `extract-workout-data` e `analyze-workout` (entrambe con `verify_jwt = true`).

## 5. UI Analysis Screen

`AnalysisScreen.tsx` resta strutturalmente uguale ma:
- Aggiunge sezione "📋 ADATTAMENTO PIANO" sotto le insights se `planAdjustment.shouldAdjust`.
- Loading state mentre l'AI elabora ("Sto leggendo i tuoi dati...").
- Gestione errori 429/402 (rate limit / crediti) con toast dedicati.

## File toccati

- **Migrazione DB**: aggiungere `race_date`, creare bucket `workout-screenshots` con RLS.
- **Edge functions** (nuove): `supabase/functions/extract-workout-data/index.ts`, `supabase/functions/analyze-workout/index.ts`.
- **`src/lib/pace-engine.ts`**: aggiungere `raceDate` al `Profile`, riscrivere `generatePlan` con fasi adattive, mantenere `analyzeWorkout` deterministico come fallback.
- **`src/lib/pace-repository.ts`**: mappare `race_date`, helper upload immagine.
- **`src/components/pace/Onboarding.tsx`**: date picker gara + calcolo giorni.
- **`src/components/pace/LogWorkout.tsx`**: sezione upload screenshot + integrazione extract.
- **`src/components/pace/AnalysisScreen.tsx`**: sezione planAdjustment + stati loading/errore.
- **`src/components/pace/Dashboard.tsx`**: banner adattamento target + warning se settimane < 3.
- **`src/pages/Index.tsx`**: cablaggio chiamate edge functions, gestione accept/ignore adjustment.

## Cosa NON faccio in questo round

- Niente streaming dell'AI (non serve per analisi one-shot).
- Niente OCR locale di backup: se l'AI fallisce, l'utente compila a mano (resta sempre possibile).
- Niente storico grafici (lo terremo per un round successivo).

