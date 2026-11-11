# Session 2026-11-11 – GET /orders/:id/price gav 404

Branch: `fix/order-price` (från `main`). Underlag: `docs/research-order-price.md`.

## Läge

Pristestet i `tests/orders.test.ts` är grönt. Felet låg i miljön, inte i routen. `python3` var Windows Store-genvägen och `psycopg` var inte installerat, och `legacyPrice.ts` gjorde om varje fel till 404.

Ändrat:
- `src/pricing/legacyPrice.ts`: tolken väljs via `PYTHON`, och `python3` är standard.
- `tests/helpers/env.ts`: använder `.venv` för testerna om den finns.
- `.env.example`: ny rad `PYTHON=`.
- `.gitignore`: ignorerar `.venv/`.

`.venv` är skapad med Python 3.13 och `requirements.txt`.

## Vad fungerade (bevis)

- **Före:** `tests/orders.test.ts` gav 1 rött av 9, `Expected: 200, Received: 404`. Det kördes efter att databasen startats.
- **Orsaken verifierad med körningar:** `python3` avslutades med kod 49 ("Python hittades inte…"), och `python src/legacy/price_calc.py 1042` gav `ModuleNotFoundError: psycopg`.
- **Skriptet i `.venv`** gav `{"net": "950", "vat": "237.5", "total": "1187.5"}`, vilket stämmer med testets förväntning.
- **Efter:** hela sviten 40 av 40 gröna. Lint och typecheck går igenom, och Prettier är ren för de ändrade filerna.
- **Commits:** `33356dc` (docs) och `e379266` (feat).

## Vad misslyckades

- **Databascontainern var stoppad** när passet började (`Exited (255)`), så alla 9 ordertester var röda. Den startades med `npm run db:up`.
- **`pip install` med Python 3.15** misslyckades, eftersom `psycopg-binary==3.2.3` saknar paket för 3.15. Miljön byggdes om med 3.13 i stället för att ändra den låsta versionen.

## Vad återstår

- `legacyPrice.ts` gör om alla fel till `not_found` (404) och kastar bort stderr. Ett saknat program eller ett DB-fel borde ge 500.
- `JSON.parse(stdout)` kan kasta i en callback utan felhantering.
- `price_calc.py` bygger SQL med strängformatering, vilket bryter mot "All SQL parametriserad". Det kräver karakteriseringstester först, eftersom avrundningen inte får röras.
- Skriptet returnerar belopp som `"950"` och `"237.5"`, inte med två decimaler som `docs/standard.md` kräver. Det är befintligt beteende och inte ändrat.
- README:n bör nämna `.venv`, `PYTHON` och att Python 3.13 eller äldre behövs för `psycopg-binary==3.2.3`.
- Stop-hookens tomma mallar i `sessions/` är fortfarande inte committade.

## Beslut

- Python-tolken styrs av en miljövariabel i stället för att `python3` byts mot `python`, så att Linux och macOS beter sig som förut.
- Den låsta versionen i `requirements.txt` behålls. `.venv` använder Python 3.13.
