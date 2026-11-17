# Codemap: den äldre prisberäkningen

Datum: 2026-11-17. Underlag för moderniseringen (arbete 3). Bygger på läsning av koden och körningar av `price_calc.py` mot testdatabasen (`butik_test`, återställd till `db/seed.sql`). **Ingen kod är ändrad.**

## 1. Filer som hör till den äldre delen

| Fil | Språk | Rader | Ansvar |
|---|---|---:|---|
| `src/legacy/price_calc.py` | Python | 66 | Räknar netto, moms och totalt för en beställning: hämtar rader och rabattkod ur databasen, drar rabatt, kapar till två decimaler och lägger på 25 % moms. Skriver en rad i `price_calc.log` per anrop. Kan köras som skript (`python price_calc.py <order_id>`), och då skrivs JSON till stdout. |
| `src/pricing/legacyPrice.ts` | TypeScript | 23 | Brygga från API:t: startar `price_calc.py` som underprocess (`execFile`) med tolken från `PYTHON` (standard `python3`), tolkar stdout som JSON och returnerar `Result<Price>`. |
| `jobs/nightly_report.py` | Python | 15 | Nattlig rapport via cron på driftservern: summerar totalen för dagens betalda ordrar. Importerar `calc_price` **och den globala uppkopplingen `conn`** direkt ur `price_calc`. |
| `src/legacy/price_calc.log` | – | – | Loggfil som skriptet lägger till rader i (tid, order-id, total). Finns i `.gitignore`. |

Tabeller som läses: `orders` (`id`, `discount_code`), `order_lines` (`quantity`, `unit_price NUMERIC(10,2)`) och `discounts` (`code`, `percent INTEGER`). `discounts.valid_from` och `valid_to` och `orders.status` finns i schemat men **läses inte**.

## 2. Beroenden

```
GET /orders/:id/price            cron (driftservern)
  src/routes/orders.ts             │
    │ getOrder() – ägarkontroll    │
    ▼                              ▼
  src/pricing/legacyPrice.ts     jobs/nightly_report.py
    │ execFile(PYTHON, [script, id]) │ import calc_price, conn
    ▼                              ▼
  src/legacy/price_calc.py ◄───────┘
    │ psycopg.connect(DATABASE_URL) vid import
    ▼
  PostgreSQL: orders, order_lines, discounts
```

- **API-vägen** startar en ny Python-process per anrop. Gränssnittet är kommandoraden (`argv[1]`), stdout (JSON) och exit-koden (0 eller 1).
- **Rapportvägen** anropar `calc_price()` direkt i Python och använder modulens `conn` för sin egen fråga. `conn` och `calc_price` måste alltså finnas kvar som namn i modulen, annars går rapporten sönder. Rapporten har inga tester och körs utanför repot.
- **Miljö:** `DATABASE_URL` (standard `localhost:5432/butik`) och `PYTHON`. Testerna sätter `DATABASE_URL` till `butik_test` i `tests/helpers/env.ts`.
- **Befintligt test:** ett enda API-test (`tests/orders.test.ts`, order 1042 → `total` 1187.5) täcker modulen, och det jämför bara `Number(total)`.

## 3. Uppmätt beteende (seed-data)

| Order | Rader | Rabatt | Status | Utdata | Kommentar |
|---|---|---|---|---|---|
| 1040 | 1 × 899,00 | – | shipped | `{"net": "899", "vat": "224.75", "total": "1123.75"}` | |
| 1041 | 3 × 129,00 + 349,00 | SOMMAR20 (giltig) | shipped | `588.8` / `147.2` / `736.0` | |
| 1042 | 2 × 375,00 + 200,00 | – | paid | `950` / `237.5` / `1187.5` | Testas idag |
| 1043 | inga rader | – | new | `0` / `0` / `0` | |
| 1044 | 1 × 199,90 | VAR10 (giltig) | paid | `179.91` / `44.97` / `224.88` | Moms 44,9775 **kapas** till 44,97 |
| 1045 | 1 × 649,00 | GAMMAL15 (**gick ut 2024-12-31**) | paid | `551.65` / `137.91` / `689.56` | Utgången rabatt dras ändå |
| 1046 | 1 × 899,00 | – | **cancelled** | `899` / `224.75` / `1123.75` | Avbruten order prissätts |
| 9999 | – | – | finns inte | `{"error": "finns inte"}`, exit 1 | |
| (testrad) | 1 × 100,00 | `FINNSINTE` | paid | `100` / `25` / `125` | Okänd kod ignoreras tyst |
| (testrad) | 1 × 100,00 | `O'HARA` | paid | `psycopg.errors.SyntaxError`, exit 1 | SQL-injektion via rabattkoden |
| `abc` | – | – | – | `ValueError`-traceback, exit 1 | |
| (inget argument) | – | – | – | `IndexError`-traceback, exit 1 | |

Den nattliga rapporten gav `2026-10-01: 1 betalda ordrar, totalt 1187.5 kr` och `2026-10-05: 1 betalda ordrar, totalt 224.88 kr`.

## 4. Kända problem

| # | Problem | Var | Konsekvens |
|---|---|---|---|
| P1 | ✅ **Rättat i steg 1 (`cf1f49a`).** **SQL byggs med strängformatering** (`"... %s" % order_id` och `"'%s'" % kod`). Bryter mot "All SQL parametriserad" (CLAUDE.md, `docs/standard.md`). | `price_calc.py:30, 36, 42`, `nightly_report.py:8` | En rabattkod med `'` kraschar beräkningen (verifierat). Med en elak kod i databasen eller ett elakt datumargument till rapporten kan godtycklig SQL köras. `order_id` skyddas idag bara av `int()` i `__main__`. |
| P2 | ✅ **Rättat i steg 2 (`b1d48c4`).** **Uppkoppling mot databasen vid import** (`conn = psycopg.connect(...)` på modulnivå). | `price_calc.py:10` | Modulen går inte att importera, och därmed inte enhetstesta, utan en databas. `conn` används som global variabel av rapporten. |
| P3 | **Avkortning, inte avrundning:** `_kapa` gör `int(x * 100) / 100`. Momsen räknas på det kapade nettot, och totalen kapas inte. | `price_calc.py:23–25, 47–49` | 1044 ger moms 44,97 i stället för 44,98. Filhuvudet säger att avrundningen inte får röras ("ekonomi har stämt av mot den"), så det är **beteende att låsa, inte rätta** utan beslut. |
| P4 | **Beloppen formateras inte med två decimaler:** `str(Decimal)` ger `"950"`, `"588.8"` och `"736.0"`. | `price_calc.py:66` | Bryter mot "returneras som strängar med två decimaler" (`docs/standard.md`, Pengar). Svaret ser olika ut från order till order. |
| P5 | **Rabattens giltighetstid ignoreras** (`valid_from`, `valid_to` läses inte). | `price_calc.py:41–45` | 1045 får 15 % med en kod som gick ut 2024. Det är en trolig affärsbugg, och den ska bekräftas med ekonomi innan den rättas. |
| P6 | **Status ignoreras:** avbrutna och nya ordrar prissätts. | `price_calc.py:30` | Påverkar inte rapporten (den filtrerar på `paid`), men API:t ger pris för avbrutna ordrar. |
| P7 | **Felhantering:** skriptet avslutas med 1 och skriver tracebacks för både "finns inte", ogiltigt argument och DB-fel. `legacyPrice.ts` gör om **alla** fel till `not_found` (404), kastar bort stderr, och `JSON.parse` kan kasta i en callback utan att felet fångas. | `price_calc.py:61–65`, `legacyPrice.ts:16–20` | Ett saknat program eller DB-fel ser ut som "beställningen finns inte" (det hände i order-price-fixen 2026-11-11). |
| P8 | **`calc_price` returnerar `None`** när ordern saknas. Rapporten kontrollerar inte det (`p.total` på `None`). | `nightly_report.py:12–13` | Teoretiskt idag, eftersom id:t kommer från samma fråga. Det blir en krasch om en order tas bort mellan frågorna. |
| P9 | **Breda `except: pass`** runt loggskrivningen, och filen stängs inte om skrivningen fallerar. | `price_calc.py:51–56` | Fel i loggningen döljs. Loggen innehåller inga personuppgifter (tid, id, total). |
| P10 | **En process per anrop** från API:t. | `legacyPrice.ts:15` | Långsamt (~100 ms + uppkoppling per anrop). Det spelar ingen roll nu, men det är ett skäl att på sikt flytta beräkningen till TypeScript. |

## 5. Beteenden som karakteriseringstester bör låsa

Testerna ska låsa **dagens** beteende, även buggarna, så att refaktoreringen inte ändrar något av misstag. Buggar rättas först i ett eget, medvetet steg, med ett nytt test.

Förslag: pytest i `tests/legacy/test_price_calc.py`. `pytest.ini` letar redan i `tests/` och `npm run test:legacy` finns. Testerna kör skriptet som underprocess mot `butik_test`, alltså samma gränssnitt som API:t använder, och återställer databasen med `db/schema.sql` och `db/seed.sql` före varje test.

| # | Beteende | Order / indata | Förväntat (exakt sträng) | Låser |
|---|---|---|---|---|
| K1 | Pris utan rabatt | 1042 | `{"net": "950", "vat": "237.5", "total": "1187.5"}` | grundberäkning, 25 % moms |
| K2 | Giltig procentrabatt | 1041 | `{"net": "588.8", "vat": "147.2", "total": "736.0"}` | rabatt före moms |
| K3 | Momsen **kapas**, avrundas inte | 1044 | `"vat": "44.97"`, `"total": "224.88"` | P3 |
| K4 | **Utgången rabatt dras ändå** (bugg) | 1045 | `{"net": "551.65", "vat": "137.91", "total": "689.56"}` | P5 |
| K5 | **Avbruten order prissätts** (bugg) | 1046 | `{"net": "899", "vat": "224.75", "total": "1123.75"}` | P6 |
| K6 | Order utan rader | 1043 | `{"net": "0", "vat": "0", "total": "0"}` | kantfall |
| K7 | Okänd rabattkod ignoreras | testorder med `FINNSINTE` | `{"net": "100", "vat": "25", "total": "125"}` | tyst fallback |
| K8 | Order som saknas | 9999 | stdout `{"error": "finns inte"}`, exit 1 | felkontraktet mot `legacyPrice.ts` |
| K9 | ~~Rabattkod med apostrof kraschar~~ Efter steg 1: koden är ett vanligt värde och ignoreras som okänd | testorder med `O'HARA` | `{"net": "100", "vat": "25", "total": "125"}` | P1 (förväntan bytt i `cf1f49a`) |
| K10 | Formateringen saknar fasta decimaler | K1, K6 | `"950"` och `"0"`, inte `"950.00"` | P4 |
| K11 | Nattrapportens summa | `nightly_report.py 2026-10-05` | `2026-10-05: 1 betalda ordrar, totalt 224.88 kr` | rapportvägen och `import conn` |

K1–K8 och K11 är vanliga karakteriseringstester. K9 och K10 dokumenterar buggar, och testet ska ändras **i samma commit** som buggen rättas, aldrig tas bort (hooken `block-test-removal.js` stoppar det).

## 6. Förslag på tre små refaktoreringssteg

Varje steg ändrar strukturen utan att ändra utdata, så att alla karakteriseringstester (K1–K11) och API-testerna är gröna efter steget. Varje steg får en egen commit (`refactor:`).

**Steg 1 – Parametriserad SQL (P1)** ✅ Klart i `cf1f49a`. Det visade sig att även rapportens datum gick att injicera: `"2026-10-05' or '1'='1"` gav alla 8 ordrar och 5746,69 kr. Ett nytt test låser att det nu ger ett fel.
- Byt till `cur.execute("... where id = %s", (order_id,))` och motsvarande för `order_lines` och `discounts` i `price_calc.py`, och för datumet i `nightly_report.py`.
- Utdata är oförändrade för K1–K8, K10 och K11. **K9 ändrar beteende:** apostrofen kraschar inte längre, och koden behandlas som okänd (`125`). Testet uppdateras i samma commit med ett nytt förväntat värde. Det är en medveten säkerhetsrättning.
- Risk: låg. Gör det först, eftersom det är en säkerhetsbrist och kodstandardens tydligaste brott.

**Steg 2 – Ingen uppkoppling vid import (P2)** ✅ Klart i `b1d48c4`. Den globala `conn` togs bort helt, i stället för att behållas för bakåtkompatibilitet. Rapporten var den enda användaren och uppdaterades i samma commit.
- Flytta `psycopg.connect` in i en funktion `connect()`. Låt `calc_price(order_id, conn=None)` öppna en egen uppkoppling om ingen skickas in, och låt `__main__` och rapporten skapa sin.
- För bakåtkompatibilitet behålls namnet `conn` tills rapporten är uppdaterad i samma commit.
- Utdata är oförändrade, och alla K-tester är gröna. Vinsten är att modulen går att importera utan databas, och det öppnar för enhetstester.

**Steg 3 – Bryt ut den rena beräkningen från databasdelen**
- Ny ren funktion `price_from(lines, percent) -> Pris`, utan I/O: summa, rabatt, `_kapa` och moms, exakt som idag. `calc_price` hämtar data och anropar `price_from`. Lägg till enhetstester för `price_from` direkt, så att K3 (kapning) och K6 (inga rader) kan testas utan databas.
- Utdata är oförändrade. Vinsten är att beräkningen blir testbar och att en senare flytt till TypeScript blir en översättning av en enda ren funktion.

**Medvetet utanför de tre stegen** (kräver beslut, eftersom de ändrar beteende): fasta två decimaler (P4), giltighetstid för rabatter (P5), status (P6) och bättre fel än 404 i `legacyPrice.ts` (P7). De är kandidater till migreringsplanen och ska bekräftas av "ekonomi" eller produktägaren först, som filhuvudet kräver för avrundningen.

## 7. Öppna frågor inför migreringsplanen

- Ska belopp lagras och returneras med fasta två decimaler? Det är en expand/contract-kandidat: lägg till en ny kolumn eller ett nytt fält, fyll båda, byt läsare och ta bort det gamla.
- Ska `discounts.valid_from` och `valid_to` börja gälla? Hur påverkas historiska ordrar som redan har fakturerats med utgångna koder?
- Ska prisberäkningen flyttas till TypeScript, så att API:t slipper starta en Python-process per anrop, eller ska Python ligga kvar för rapportens skull?
