

# Piano: Sessioni completate visibili + Recap nel "Prossimo spunto"

Due cambi che chiudono il loop tra ciò che hai fatto e ciò che ti aspetta dopo.

## 1. Sessione completata: vedi i dati, non il form di log

**Problema:** Cliccando su una sessione già loggata dalla "Panoramica spunti", si apre `SessionDetail` con il bottone "REGISTRA QUESTO ALLENAMENTO" — sembra che tu possa riloggarla, e i tuoi dati spariscono.

**Soluzione:**
- In `Dashboard.tsx`, quando clicco una sessione completata, passo anche il `WorkoutLog` corrispondente (cercato in `logs` per `weekIdx + sessionIdx`).
- `SessionDetail.tsx` riceve un nuovo prop opzionale `loggedData?: WorkoutLog`. Se presente:
  - In testa, sotto i pill, mostro un riquadro **"✓ ALLENAMENTO COMPLETATO"** con badge data.
  - Nuova sezione **"▼ COSA HAI FATTO"** con i numeri reali: distanza, durata, pace calcolato, FC media, FC max, RPE, cadenza, note.
  - Le sezioni "spunti per la sessione" e "intensità indicative" restano sotto, come riferimento di cosa era previsto.
  - Il bottone in basso cambia da "REGISTRA QUESTO ALLENAMENTO" a **"TORNA AL DIARIO"** (oppure nascosto, con solo la freccia indietro).
- Le sessioni non ancora completate continuano a funzionare come oggi.

## 2. "Prossimo spunto" arricchito: recap + consiglio del coach

**Problema:** Il blocco "PROSSIMO SPUNTO" sul Dashboard mostra solo la sessione futura, senza ricordare com'è andata l'ultima.

**Soluzione (lato dati):**
- Salvare l'ultima analisi AI in DB così sopravvive ai refresh:
  - Nuova tabella `workout_analyses` con `id, user_id, log_id, technical_reading, session_highlight, next_move, created_at` + RLS (solo proprietario).
  - In `Index.tsx`, dopo che l'AI risponde con successo, salvo l'analisi legata al log appena inserito.
  - Carico l'ultima analisi insieme a profile/plan/logs in `useEffect`.
- Nuovo helper in `pace-engine.ts` o `Index.tsx`: `getLastCompletedLog(logs)` ritorna l'ultimo log per `loggedAt`.

**Soluzione (lato UI Dashboard):**
- Sopra il blocco "PROSSIMO SPUNTO" attuale, aggiungo (solo se esiste un ultimo log):
  - **"▼ ULTIMO ALLENAMENTO"** card chiara con: nome sessione, distanza, durata, pace, FC media, RPE.
  - Se esiste l'ultima analisi AI: estratto del `nextMove` del coach in evidenza ("💬 Il coach dice: ...").
- Il blocco "PROSSIMO SPUNTO" attuale resta sotto, ma gli aggiungo in fondo una riga "Consiglio dal tuo ultimo allenamento" con 1-2 frasi del `nextMove`, così il collegamento è esplicito.

## File toccati

- **Migrazione DB:** crea `workout_analyses` con RLS.
- **`src/lib/pace-repository.ts`:** `saveAnalysis`, `loadLatestAnalysis`.
- **`src/pages/Index.tsx`:** salva analisi dopo AI, carica ultima analisi all'avvio, passa `loggedData` + `lastLog` + `lastAnalysis` ai figli.
- **`src/components/pace/Dashboard.tsx`:** nuovo blocco "Ultimo allenamento" + estratto coach nel "Prossimo spunto"; passa il log corretto a `onOpenSession` quando la sessione è completata.
- **`src/components/pace/SessionDetail.tsx`:** prop `loggedData`, nuova sezione "Cosa hai fatto", bottone condizionale.
- **`src/lib/pace-engine.ts`:** piccolo helper `getLastCompletedLog`.

## Cosa NON faccio

- Niente modifica/cancellazione dei log loggati (lo storico resta immutabile per ora).
- Niente storico completo delle analisi (mostro solo l'ultima — visualizzazione storica in un round successivo).

