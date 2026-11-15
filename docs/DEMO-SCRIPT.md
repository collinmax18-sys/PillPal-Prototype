# P4 Part B: Lab Demonstration Script (≈ 10 minutes)

Goal: show **working functionality**, not slides. Split the speaking parts so that every team member presents one section and can answer questions on it (B3).

## Before the lab (B4 readiness checklist)

- [ ] Laptop: `cd app && npx expo start`. Phone and laptop on the same Wi‑Fi (or use `npx expo start --tunnel`).
- [ ] Phone: Expo Go installed, notifications allowed, internet on (for RxNorm/openFDA).
- [ ] Settings → *Delete all my data*, then *Load synthetic demo data* (fresh, predictable state).
- [ ] Open *Drug information* for each demo medication once, so labels are cached (the label check also works offline).
- [ ] Back-up plan: the web preview (`npx expo start --web`) and screenshots in `docs/screenshots/`.
- [ ] Terminal ready to run `npm test` in `app/`.

## 1. Problem and contribution (1 min, Member A)
"Reminder apps exist. Our P2 gap was **simple medication management + trustworthy information + understandable presentation**. PillPal goes beyond a generic reminder app with standardized RxNorm entry, the official FDA label organized into readable sections, and a **'how did it make me feel' journal that checks your reported effects against that label**. We deliberately kept the scope on this core workflow instead of adding AI."

## 2. Add a medication from a trusted source (FR1, FR2, FR7) (2 min, Member B)
1. Meds → **+ Add** → type `lipitr` (misspelled on purpose). RxNorm's approximate match returns *atorvastatin … [Lipitor]*.
2. Point out the **RxCUI**. Strength and form are filled in from the RxNorm name.
3. Add reminder times **8:00 AM** and **9:00 PM**, supply **30**, then *Save*.
4. Explain: only the drug name goes to RxNorm. Manual entry works offline.

## 3. Reminder → record dose → "How are you feeling?" (FR3, FR4, effects journal) (3 min, Member C)
1. Settings → **Send test reminder (5 s)**. Lock the phone and show it arrive (app closed / airplane mode works too: it is a local notification).
2. On Today, tap **✓ Taken** on *lisinopril*. The **How are you feeling?** screen opens automatically.
3. Choose *Okay*, tick **Dizziness**, **Cough** and **Anxious / jittery**.
4. The **Label check** card appears: *Dizziness* and *Cough* are **listed under "Side effects (adverse reactions)"**, with the FDA excerpt. *Anxious / jittery* is **not in the label**, so PillPal suggests mentioning it to a pharmacist. This runs on-device as simple text matching against the label.
5. Choose *Severe* to show the safety notice. Type a note and save.
6. Show the supply count went down by one and the Today progress updated.

## 4. History, journal and clinician summary (FR5, FR6) (1.5 min, Member D)
1. **History** → 30 days: adherence %, daily stacked chart, per-medication bars. Tap a dose to correct it.
2. **Journal**: average mood, mood trend, most reported effects, timeline, "in label" tags.
3. **Share with my clinician**: the medication list with RxCUIs, adherence and recent notes. Explain the medication-reconciliation motivation from P1.

## 5. Trusted drug information (FR7, B2) (1.5 min, Member B or A)
1. sertraline → **Drug information**: the official FDA label from openFDA, found by the RxCUI saved in step 2.
2. Point out: the **boxed warning comes first** in red, every section has a plain title ("What it is used for", "How to take it", "Side effects"), long sections are collapsed, and the label version and source are shown.
3. Turn on airplane mode and reopen it: the label is **saved for offline use**. *Open full label on DailyMed* links to the complete source.
4. Explain the link to the journal: the same cached label powers the side-effect check in step 3.

## 6. Engineering evidence and what is not done (1 min, any member)
- `app: npm test` gives 51 passing tests, including the midnight-crossing dose, DST, the iOS 64-notification limit and the ~3,800-record performance check.
- **Not done yet, clearly planned:** Firebase accounts/sync and caregiver invite links, the device reminder-reliability run (E2), and usability sessions (E6). The optional AI explainer (FR8) was dropped from scope on purpose.

## Likely questions (B3) – who answers
| Question | Short answer | Code |
|---|---|---|
| How do reminders work with the app closed? | Local OS notifications scheduled with `expo-notifications`; a rolling 60-dose window rebuilt on app open / data change because iOS keeps only 64 | `app/src/services/notifications.ts` |
| How is "missed" decided? | Pure function: no log + now > scheduled + grace → missed; written as an explicit `auto` record | `app/src/core/schedule.ts` |
| Why doesn't a new med show earlier doses as missed? | `dropPreCreationDoses`: doses whose grace ended before the med was added are ignored | `app/src/core/schedule.ts` |
| How does the label check work? | Effect tag → synonym list → word-boundary search in adverse-reaction/warning sections only, excerpt returned | `app/src/core/effects.ts` |
| Why no AI? | P3 made FR8 optional. We prioritized a reliable core workflow; the label is shown verbatim from the FDA so nothing is reworded or invented | – |
| Why did atorvastatin first show an empty label? | openFDA's first match was a repackager label with no clinical sections; we now fetch up to 5 and pick the most complete | `app/src/core/drugdata.ts` |
| Where is data stored? Is it encrypted? | On-device SQLite. SQLCipher with a Keystore/Keychain key in development builds; Expo Go cannot encrypt (shown in Settings) | `app/src/data/device-db.ts` |
| Why openFDA and not Health Canada DPD? | openFDA labels are indexed by RxCUI. Canadian-only brands may be missing (reported as a limitation) | `app/src/services/druginfo.ts` |
