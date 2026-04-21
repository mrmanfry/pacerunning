

## Compliance GDPR base + disclaimer MDR per PACE

Implementazione minima ma solida: copre GDPR (Reg. 2016/679), aggiunge la dichiarazione esplicita "non è dispositivo medico" (Reg. UE 2017/745 — MDR) e fa un audit linguistico del prompt AI per evitare che un domani PACE scivoli accidentalmente in territorio MDR / AI Act high-risk.

### 1. Pagine legali pubbliche

Tre nuove route accessibili senza login:

- **`/privacy`** — Informativa privacy in italiano. Sezioni:
  - Titolare: `[NOME TITOLARE TODO]`, contatto `[EMAIL TODO]`, sede `[PAESE TODO]`
  - Dati raccolti: account (email, password hashata), profilo fisico (età, peso, sesso, FCriposo), allenamenti (distanza, FC, RPE, note), screenshot caricati
  - **Sezione art. 9 GDPR**: dati relativi alla salute, base giuridica = consenso esplicito
  - Finalità: gestione diario sportivo personale + analisi descrittiva via AI
  - Sub-processori: Supabase (hosting EU), Lovable AI Gateway (analisi)
  - Conservazione: fino a cancellazione account
  - Diritti: accesso, rettifica, cancellazione, portabilità, opposizione, reclamo al Garante
  - **Disclaimer MDR**: PACE non è dispositivo medico ai sensi del Reg. UE 2017/745
- **`/terms`** — Termini d'uso con disclaimer medico rinforzato + limitazione responsabilità + clausola MDR formale
- **`/contact`** — Email per esercizio diritti GDPR

### 2. Friction Wall — consenso esplicito art. 9

Aggiunta di un **quarto checkbox** dedicato esclusivamente ai dati sanitari, separato dal C3 attuale:

> "Acconsento espressamente al trattamento dei miei dati relativi alla salute (frequenza cardiaca, peso, RPE) ai sensi dell'art. 9 GDPR, per generare analisi descrittive dei miei allenamenti."

E una riga di trasparenza AI:

> "I dati numerici dei tuoi allenamenti vengono inviati a un servizio AI europeo (Lovable AI Gateway) per generare l'analisi descrittiva. Le immagini caricate restano sui nostri server cifrati."

### 3. Versionamento consensi

Aggiunta colonne a `consents`:
- `consent_version text NOT NULL DEFAULT 'v1-2025-04-21'`
- `terms_version text NOT NULL DEFAULT 'v1-2025-04-21'`
- `c4_health_data boolean NOT NULL DEFAULT false`

Costanti `CURRENT_CONSENT_VERSION` e `CURRENT_TERMS_VERSION` in `src/lib/legal-versions.ts`. In `Index.tsx`, dopo il load consensi, se le versioni salvate non combaciano → riproposto il friction wall.

### 4. Export dati (art. 20 — portabilità)

Bottone in `Settings.tsx`: "Scarica i miei dati". Genera JSON client-side con profilo + consensi + workout_logs + workout_analyses. Nuova funzione `exportAllUserData(userId): Promise<Blob>` in `pace-repository.ts`. Download immediato tramite blob URL.

### 5. Reset password

- Link "Password dimenticata?" in `AuthScreen.tsx`
- Nuova route `/reset-password` (`src/pages/ResetPassword.tsx`) che gestisce il token recovery di Supabase
- Email recovery via `supabase.auth.resetPasswordForEmail` con `redirectTo: <origin>/reset-password`

### 6. Audit linguistico prompt AI (anti-MDR)

Il `SYSTEM_PROMPT` di `analyze-workout` è già molto descrittivo (v2-2025-04-21-xml). Audit puntuale:

**Cose da rinforzare**:
- Estendere `FORBIDDEN_WORDS` con: `"riduci"`, `"aumenta"`, `"evita"`, `"smetti"`, `"non fare"`, `"non correre"`, `"infiammazione"`, `"sovrallenamento"`, `"overtraining"`, `"infortunio"`, `"trauma"`, `"sintomo"`, `"diagnosi differenziale"`
- Nuovo blocco `<mdr_compliance>` nel system prompt che ribadisce: PACE è strumento descrittivo personale, non genera predizioni cliniche, non valuta rischio sanitario, non monitora condizioni
- Bumpare `PROMPT_VERSION` a `v3-2025-04-21-mdr`

**Cose già OK** (lascio invariate):
- Struttura `<role>`, `<tone>`, `<language_rules>`, `<never_do>` già conformi
- Formula "potresti", "una possibilità è" già imposta
- Blocco `<safety>` su sintomi già rimanda al medico

### 7. Disclaimer MDR esplicito nel friction wall e nei termini

Nuova sezione visibile in `FrictionWall.tsx` e in `/terms`:

> "PACE non è un dispositivo medico ai sensi del Regolamento UE 2017/745 (MDR). Non fornisce diagnosi, terapie, monitoraggio clinico, predizioni sanitarie o valutazioni del rischio. È uno strumento descrittivo per uso personale ricreativo."

### File toccati

```text
NUOVI:
  src/pages/Privacy.tsx
  src/pages/Terms.tsx
  src/pages/Contact.tsx
  src/pages/ResetPassword.tsx
  src/lib/legal-versions.ts

MODIFICATI:
  src/App.tsx                          → 4 nuove route pubbliche
  src/components/pace/FrictionWall.tsx → 4° checkbox + sezione AI + clausola MDR
  src/components/pace/AuthScreen.tsx   → link "Password dimenticata"
  src/components/pace/Settings.tsx     → bottone "Scarica i miei dati" + link a /privacy /terms
  src/lib/pace-repository.ts           → exportAllUserData() + save/load consent_version, terms_version, c4_health_data
  src/pages/Index.tsx                  → check versioni consenso, riproponi wall se obsoleto
  src/pages/Landing.tsx                → footer link a /privacy /terms /contact
  supabase/functions/analyze-workout/index.ts → FORBIDDEN_WORDS estesa, blocco <mdr_compliance>, PROMPT_VERSION bump

DATABASE (migrazione):
  ALTER TABLE consents ADD consent_version text NOT NULL DEFAULT 'v1-2025-04-21';
  ALTER TABLE consents ADD terms_version text NOT NULL DEFAULT 'v1-2025-04-21';
  ALTER TABLE consents ADD c4_health_data boolean NOT NULL DEFAULT false;
```

### Cosa NON è incluso (consapevolmente, scelta tua)

- Audit log accessi dati sanitari (provv. Garante 2015) → non incluso
- Pseudonimizzazione `user_id` nei log AI → non incluso
- DPIA + Registro trattamenti formali → non inclusi (te li puoi generare in autonomia o richiederli in un round successivo)
- Cleanup automatico `ai_requests` → non incluso

Restano disponibili per un round successivo se la base utenti cresce o se vuoi una postura più solida.

### Placeholder da riempire dopo

Cerca nei file generati i marker:
- `[NOME TITOLARE TODO]` — ragione sociale o nome persona fisica
- `[EMAIL CONTATTO TODO]` — email per richieste GDPR
- `[PAESE TODO]` — paese di sede (determina Garante competente)

