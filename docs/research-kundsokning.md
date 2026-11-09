# Research: Kundsökning (user story 7)

> Som kundtjänst vill vi kunna söka kunder på namn eller e-post.

Datum: 2026-11-06. Den här filen bygger enbart på att jag läst koden. Ingen kod är ändrad.

## 1. Nuläge: relevanta delar av koden

| Fil | Vad den gör och varför den är relevant |
|---|---|
| `src/app.ts` | Monterar routrarna `customers` och `orders`. En ny route hamnar i `routes/customers.ts` eller i en ny router. |
| `src/routes/customers.ts` | Har `POST /customers`, `GET /customers/me` och `GET /customers/me/orders`. Det är mönstret att följa: tunn route, `sendResult`. |
| `src/services/customerService.ts` | Typen `Customer = { id, uuid, name, email }`. Alla frågor är parametriserade (`$1`). Här läggs `searchCustomers`. |
| `src/auth.ts` | `requireCustomer` läser `X-Customer-Id` och sätter `req.customerId`. **Det finns ingen roll, ingen admin och ingen kundtjänst.** |
| `src/result.ts`, `src/http.ts` | `Result`, `ok`/`err` och felkoderna `invalid_input` (400), `forbidden` (403), `not_found` (404) och `conflict` (409). 401 skickas direkt i `requireCustomer`. |
| `db/schema.sql` | `customers(id, uuid, name TEXT, email TEXT, created_at)`. Den saknar index utöver PK och har ingen unik e-post. |
| `db/seed.sql` | Åtta fiktiva kunder (`@example.com`), bland annat `Hugo Nyström` / `hugo.nystrom@example.com`. Den är bra att testa å/ä/ö mot. |
| `tests/customers.test.ts`, `tests/helpers/db.ts` | Supertest-tester. DB:n återställs med `schema.sql` + `seed.sql` före varje test. |
| `docs/standard.md` | Reglerna som styr designen (se avsnitt 2). |
| `docs/api.md` | Den måste uppdateras med den nya endpointen. |

Postgres-versionen är 16 (`docker-compose.yml`). `ILIKE`, `lower()` och tillägget `pg_trgm` finns, men `pg_trgm` är inte aktiverat.

Projektet har inget migreringsverktyg. Schemat återskapas helt från `db/schema.sql` vid `db:reset` och i varje test.

## 2. Regler i kodstandarden som påverkar funktionen

- **Parametriserad SQL.** Söktermen får aldrig byggas in i SQL-strängen. Mönstret byggs i JS och skickas som `$1`.
- **"En sökning som inte hittar något returnerar 200 och en tom lista."** Det är uttryckligen reglerat.
- **Fältnamn i camelCase** i JSON-svaret.
- **Inga personuppgifter i loggar.** Söktermen (namn eller e-post) är en personuppgift och får inte loggas.
- **Behörighet:** den inloggade identiteten hämtas med middleware, aldrig från body eller query.
- **Tester:** varje endpoint ska ha tester för det lyckade fallet och för 400/401/403/404 där de är möjliga.

## 3. Det viktigaste problemet: behörighet

Storyn gäller **kundtjänst**, men systemet känner bara till **kunder**. Om vi bara lägger sökningen bakom `requireCustomer` kan varje inloggad kund söka fram alla andras namn och e-post. Det vore ett dataläckage (personuppgifter, GDPR).

Alternativ:

| Alternativ | Fördelar | Nackdelar |
|---|---|---|
| **A. Roll-kolumn** `customers.role TEXT NOT NULL DEFAULT 'customer'` och middleware `requireSupport` som slår upp rollen. | Enkelt, testbart och passar den befintliga headermodellen. Ger 403 för vanliga kunder. | Blandar personal och kunder i samma tabell. |
| **B. Separat tabell** `staff` och en egen header, till exempel `X-Staff-Id`. | Ren separation. | Mer kod. En andra autentiseringsväg för en övning. |
| **C. Ingen behörighetskontroll** | Minst kod. | Läcker personuppgifter. **Det är inte acceptabelt.** |

**Rekommendation: A.** En kund med `role = 'support'` läggs i seed som fiktiv testdata. Det ger ett naturligt 403-test, vilket standarden kräver.

Eftersom det inte finns något migreringsverktyg ändras `db/schema.sql` direkt. Ändringen läggs också som en framåt- och bakåtmigrering, `db/migrations/001_customer_role.up.sql` och `.down.sql`, eftersom `user-stories.md` kräver "migreringar i steg som går att backa". Beslutet bör loggas som en ADR i `docs/adr/`.

## 4. Sökningen: tekniska överväganden

- **Matchning:** delsträng utan hänsyn till skiftläge på `name` **eller** `email`, med `ILIKE $1` och mönstret `%term%`.
- **Escape av jokertecken:** `%`, `_` och `\` i söktermen måste escapas i JS innan den läggs i mönstret. Annars matchar `"%"` alla kunder. Det är ingen SQL-injektion, men det är oavsiktligt beteende och bör ha ett eget test.
- **Å/Ä/Ö:** `ILIKE` i en UTF8-databas skiftlägesviker även å, ä och ö. Ett test som söker `"nyström"` och `"NYSTRÖM"` verifierar det. Sökningen `"nystrom"` träffar i dag bara via e-postadressen. Accentokänslig sökning (`unaccent`) är en möjlig senare utökning, inte ett krav.
- **Validering (400):**
  - Termen `q` saknas eller är tom efter trim, eller är kortare än 2 tecken. Det hindrar att någon listar alla kunder.
  - Termen är längre än cirka 100 tecken.
  - `q` är inte en sträng, till exempel `?q=a&q=b`, som Express tolkar som en array.
- **Begränsning:** `LIMIT` (till exempel 50) och sortering `ORDER BY name, id` för stabila svar. Sidindelning ingår inte i storyn.
- **Prestanda:** `%term%` kan inte använda B-tree-index. Med dagens datamängd spelar det ingen roll. Vid större volymer kan ett GIN-index med `pg_trgm` läggas till. Det noteras som möjlig senare åtgärd, men görs inte nu (YAGNI).
- **Svarsfält:** `{ id, uuid, name, email }`, alltså samma `Customer`-typ som finns. Exponera inte `created_at` eller `role` om det inte behövs.

## 5. Förslag på API

```
GET /customers?q=<term>
Header: X-Customer-Id: <id för en användare med role=support>
200 → [{ id, uuid, name, email }, ...]   (tom lista om inget hittas)
400 → q saknas, är för kort, för lång eller inte en sträng
401 → ingen eller ogiltig X-Customer-Id
403 → inloggad, men inte kundtjänst
```

Ett alternativ är `GET /customers/search?q=`. `GET /customers?q=` är mer REST-enligt och krockar inte med `/customers/me`, som är en egen route.

404 är inte relevant för själva sökningen, eftersom ingen träff ger 200 och `[]`. Däremot ska en `X-Customer-Id` som inte finns i databasen ge 403, inte 500.

## 6. Utkast till acceptanskriterier (Givet/När/Så)

1. **Givet** att jag är inloggad som kundtjänst, **när** jag söker `q=lind`, **så** får jag 200 och en lista som innehåller Alva Lind.
2. **Givet** kundtjänst, **när** jag söker på en del av en e-postadress, till exempel `q=farid.h`, **så** får jag Farid Haddad.
3. **Givet** kundtjänst, **när** jag söker `q=NYSTRÖM`, **så** hittas Hugo Nyström, eftersom sökningen inte tar hänsyn till skiftläge.
4. **Givet** kundtjänst, **när** inget matchar, **så** får jag 200 och `[]`.
5. **Givet** kundtjänst, **när** `q` saknas, är tom eller är kortare än 2 tecken, **så** får jag 400 `invalid_input`.
6. **Givet** kundtjänst, **när** `q` är `%%`, **så** tolkas det som bokstavliga tecken och ger `[]`, inte alla kunder.
7. **Givet** att jag inte är inloggad, **när** jag söker, **så** får jag 401.
8. **Givet** att jag är inloggad som vanlig kund, **när** jag söker, **så** får jag 403 `forbidden`.
9. **Givet** kundtjänst, **när** träffarna är fler än gränsen, **så** returneras högst N träffar, sorterade på namn.

## 7. Risker och öppna frågor

- **Rollmodellen (avsnitt 3)** är det enda beslutet som påverkar schemat. Den behöver bekräftas innan planen skrivs.
- Ska kundtjänst själv vara en rad i `customers`? Det är enklast i övningen, men det är en förenkling som bör stå i ADR:en.
- Sökgräns (50) och minsta längd (2) är förslag. De kan justeras i planen.
- `GET /customers/me` påverkas inte, men vi bör kontrollera att routeordningen inte krockar.
- Söktermer får inte hamna i loggar eller felmeddelanden, till exempel inte som `"Inga träffar för 'alva.lind@…'"`.

## 8. Filer som troligen ändras

- `src/auth.ts`: `requireSupport` eller en generell rollkontroll
- `src/services/customerService.ts`: `searchCustomers(term)`
- `src/routes/customers.ts`: `GET /customers`
- `db/schema.sql`, `db/seed.sql` och `db/migrations/001_customer_role.{up,down}.sql`
- `tests/customers.test.ts` (eller den nya filen `tests/customerSearch.test.ts`)
- `docs/api.md` och `docs/adr/0001-kundtjanstroll.md`
