# ADR 0001: Kundsökning utan rollkontroll i första iterationen

- **Status:** Accepterad
- **Datum:** 2026-11-06 (beslut), 2026-11-09 (nedskriven)
- **Berör:** `GET /customers?q=` (user story 7), `src/auth.ts`, `db/schema.sql`

## Sammanhang

User story 7 säger att *kundtjänst* ska kunna söka kunder på namn eller e-post. Systemet känner bara till kunder. `requireCustomer` läser `X-Customer-Id`, och det finns ingen roll, ingen admin och ingen kundtjänst.

Researchen (`docs/research-kundsokning.md`, avsnitt 3) tog fram tre alternativ:

| | Alternativ | Bedömning |
|---|---|---|
| A | Roll-kolumn `customers.role` och middleware `requireSupport` (403 för vanliga kunder) | Rekommenderat. Kräver en schemaändring och en migrering. |
| B | En separat `staff`-tabell med en egen header | Ren separation, men mer kod än övningen motiverar. |
| C | Ingen behörighetskontroll utöver inloggning | Minst kod. Läcker personuppgifter. |

## Beslut

I den här iterationen ligger endpointen **bara bakom `requireCustomer`**. Varje inloggad användare får 200. Schemat och seed-datan ändras inte, och ingen migrering görs.

Det betyder att alternativ C väljs **tillfälligt**, för att bygga och testa själva sökningen (validering, escape, sortering, tak) utan att blanda in en schemaändring. Alternativ A är fortfarande målbilden.

## Konsekvenser

- **Dataläckage (GDPR):** alla inloggade kunder kan söka fram andra kunders namn och e-post. **Endpointen får inte gå i produktion i det här skicket.**
- **Uppräkning:** man kan läsa ut hela kundregistret i omgångar genom att söka på vanliga teckenpar. Minst 2 tecken och `LIMIT 50` begränsar risken men eliminerar den inte.
- Testerna saknar ett 403-fall, trots att `docs/standard.md` kräver det där det är möjligt. Det läggs till tillsammans med rollkontrollen.
- Söktermen loggas aldrig och står aldrig i felmeddelanden.
- `%term%` kan inte använda index. Det spelar ingen roll med dagens datamängd. `pg_trgm` med ett GIN-index är en möjlig senare åtgärd.

## När beslutet ska tas upp igen

Senast **innan endpointen exponeras utanför utvecklingsmiljön**, eller när nästa story som rör personal eller roller planeras. Då genomförs alternativ A:

1. `customers.role TEXT NOT NULL DEFAULT 'customer'` i `db/schema.sql`, plus `db/migrations/001_customer_role.{up,down}.sql`.
2. En fiktiv kundtjänstanvändare med `role = 'support'` i `db/seed.sql`.
3. `requireSupport` i `src/auth.ts`: 403 `forbidden` för vanliga kunder och för en `X-Customer-Id` som inte finns.
4. Testerna i `tests/customerSearch.test.ts` byter till kundtjänstanvändaren, och ett 403-test läggs till.
