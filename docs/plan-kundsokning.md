# Plan: Kundsökning (user story 7)

> Som kundtjänst vill vi kunna söka kunder på namn eller e-post.

Underlag: `docs/research-kundsokning.md`. Datum: 2026-11-06.

## Beslut som avgränsar planen

- **Ingen rollkontroll i den här iterationen.** Beslutet togs 2026-11-06. Endpointen kräver inloggning (`requireCustomer`). Alla inloggade får 200.
- Ingen schemaändring och ingen migrering. `db/schema.sql` och `db/seed.sql` lämnas orörda.
- Beslutet och dess konsekvens dokumenteras i `docs/adr/0001-kundsokning-utan-roll.md` (se Risker).

## Mål

En inloggad användare kan söka kunder på en del av namnet eller e-postadressen och får tillbaka en begränsad, sorterad lista. Sökningen tar inte hänsyn till skiftläge, är säker mot SQL-injektion och behandlar jokertecken i söktermen som vanliga tecken.

## Acceptanskriterier

| # | Givet | När | Så |
|---|---|---|---|
| 1 | inloggad (`X-Customer-Id: 1`) | `GET /customers?q=lind` | 200 och listan innehåller exakt Alva Lind |
| 2 | inloggad | `GET /customers?q=farid.h` (en del av e-postadressen) | 200 och Farid Haddad |
| 3 | inloggad | `GET /customers?q=NYSTRÖM` | 200 och Hugo Nyström, eftersom skiftläget inte spelar roll, inte heller för å, ä och ö |
| 4 | inloggad | `GET /customers?q=zzzz` | 200 och `[]` |
| 5 | inloggad | `q` saknas, `q=` eller `q=   ` | 400 `invalid_input` |
| 6 | inloggad | `q=a` (kortare än 2 tecken efter trim) | 400 `invalid_input` |
| 7 | inloggad | `q` är längre än 100 tecken | 400 `invalid_input` |
| 8 | inloggad | `q=a&q=b` (array) | 400 `invalid_input` |
| 9 | inloggad | `q=%%` eller `q=__` | 200 och `[]`, eftersom jokertecknen tolkas bokstavligt |
| 10 | inloggad | `q=example.com` (alla kunder matchar) | 200, högst 50 träffar, sorterade på `name` och sedan `id` |
| 11 | inte inloggad | `GET /customers?q=lind` | 401 `unauthorized` |
| 12 | inloggad | `q=' OR 1=1 --` | 200 och `[]`, eftersom SQL-injektion inte har någon effekt |

Kriterium 10 verifieras med seed-datan, där alla åtta kunder har `@example.com`. Testet kontrollerar att svaret har åtta träffar och är sorterat. Själva taket 50 verifieras i ett enhetstest av konstanten och SQL-frågan, eller genom att testet lägger in fler än 50 fiktiva kunder. Jag väljer det senare i testet, och kunderna skapas i testet med `@example.com`.

## API-kontrakt

```
GET /customers?q=<term>
Header: X-Customer-Id: <positivt heltal>

200 OK
[
  { "id": 1, "uuid": "…", "name": "Alva Lind", "email": "alva.lind@example.com" }
]

400 { "error": { "code": "invalid_input", "message": "q måste vara 2–100 tecken." } }
401 { "error": { "code": "unauthorized",  "message": "Logga in först." } }
```

- Termen trimmas. Längden ska vara mellan 2 och 100 tecken.
- Matchningen är `name ILIKE $1 OR email ILIKE $1`, där `$1 = '%' + escape(term) + '%'`.
- Vid escape får `\`, `%` och `_` ett prefix `\`. Det är Postgres standard-escapetecken för `LIKE`.
- Sorteringen är `ORDER BY name, id` och gränsen är `LIMIT 50`.
- Svarsfälten är de i den befintliga typen `Customer`: `id`, `uuid`, `name`, `email`.
- Felmeddelanden och loggar får aldrig innehålla söktermen.

## Filer som berörs

| Fil | Ändring |
|---|---|
| `tests/customerSearch.test.ts` | **Ny.** Supertest-tester för kriterierna 1–12. |
| `src/services/customerService.ts` | Ny funktion `searchCustomers(q: unknown): Promise<Result<Customer[]>>` som validerar, escapar och kör frågan. |
| `src/routes/customers.ts` | Ny route `GET /customers` med `requireCustomer` och `sendResult`. |
| `docs/api.md` | Ny rad i endpoint-tabellen. |
| `docs/adr/0001-kundsokning-utan-roll.md` | **Ny.** Beslutet att inte införa en roll nu, konsekvenser och villkor för att ta upp frågan igen. |
| `sessions/2026-11-06-kundsokning.md` | Sessionslogg efter arbetspasset. |

Inga ändringar i `db/`, `src/auth.ts`, `src/app.ts` eller i befintliga tester.

## Risker

| Risk | Konsekvens | Hantering |
|---|---|---|
| **Alla inloggade kunder kan söka fram andra kunders namn och e-post.** | Personuppgifter exponeras (GDPR). Storyn säger "kundtjänst", men implementationen kontrollerar inte det. | Ett medvetet beslut som dokumenteras i ADR 0001 och i `docs/api.md`. Endpointen får inte gå i produktion innan en rollkontroll finns. Alternativ A i researchfilen är redo att plockas upp. |
| Uppräkning av alla kunder genom att söka på vanliga tecken, till exempel `q=ex` | Hela kundregistret kan läsas ut i omgångar. | Minst 2 tecken och `LIMIT 50` begränsar risken men eliminerar den inte. Det täcks av samma ADR. |
| Jokertecken i `q` ger oavsiktliga träffar | `%` matchar allt. | Escape plus test (kriterium 9). |
| Söktermen hamnar i loggar | Personuppgifter i loggar, vilket bryter mot standarden. | Ingen loggning av `q`. Felmeddelandet är generiskt. Granskas i `/review`. |
| `%term%` kan inte använda index | Långsam sökning vid stora volymer. | Inte relevant nu. `pg_trgm` + GIN noteras som senare åtgärd i ADR:en. |
| Routekrock med `/customers/me` | Fel handler. | `GET /customers` och `GET /customers/me` är olika sökvägar i Express. Befintliga tester visar att det fungerar. |

## Steg i ordning

1. **ADR:** skriv `docs/adr/0001-kundsokning-utan-roll.md`.
2. **Rött test:** skapa `tests/customerSearch.test.ts` med kriterium 11 (401) och kriterium 1 (sökning på namn). Kör `npm test`. Testerna ska bli röda: route saknas, så kriterium 1 ger 404.
3. **Grönt:** lägg till route och en minimal `searchCustomers` med parametriserad `ILIKE`. Kör `npm test`, och alla tester ska bli gröna.
4. **Rött → grönt, i omgångar.** Lägg till testerna i grupper och implementera efter varje grupp:
   - a. e-post, skiftläge och å/ä/ö samt tom lista (kriterierna 2, 3, 4)
   - b. validering (kriterierna 5–8)
   - c. escape av jokertecken och SQL-injektion (kriterierna 9, 12)
   - d. sortering och tak (kriterium 10)
5. **Refaktorera** med grönt hela tiden: bryt ut `escapeLike()` och konstanterna `MIN_Q`, `MAX_Q` och `SEARCH_LIMIT`.
6. **Kontroller:** kör `npm run lint`, `npm run typecheck` och `npm run format:check`.
7. **Dokumentation:** uppdatera `docs/api.md` med en varning om den saknade rollkontrollen.
8. **Granska:** kör `/review` på ändringen och åtgärda fynden.
9. **Commit:** gör en commit per steg med `test: ` eller `feat: `, och `docs: ` för dokumentationen.
10. **Sessionslogg:** skriv `sessions/2026-11-06-kundsokning.md`.

Testerna kräver att Docker-databasen kör (`npm run db:up`). Om den inte gör det stoppar jag och säger till i stället för att gå vidare utan röda och gröna körningar.
