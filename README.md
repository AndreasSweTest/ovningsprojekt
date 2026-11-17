# Övningsprojekt: butikens API

Övningsprojektet för delkursen *AI-assisterad systemutveckling*. Det är kodbasen du bygger din rigg för i kursprojektet.

Projektet innehåller två delar med olika ålder och kvalitet:

- **REST-API:t** för kunder och beställningar, i TypeScript med Express och PostgreSQL. Det har tester och följer kodstandarden i `docs/standard.md` någorlunda.
- **Den äldre prisberäkningen** i `src/legacy/price_calc.py`, i Python. Den var odokumenterad och saknade tester. Nu har den karakteriseringstester och en codemap (`docs/codemap-price-calc.md`), och den moderniseras i kursprojektet.

## Kom igång

Du behöver Node.js 22 eller senare, Python 3.11–3.13, Docker och git. Den låsta `psycopg-binary==3.2.3` har inga färdiga paket för Python 3.14 eller senare.

```bash
npm install
python -m venv .venv                # på Windows: py -3.13 -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # macOS/Linux: .venv/bin/python
cp .env.example .env
npm run db:up                       # startar PostgreSQL i Docker (Docker Desktop måste vara igång)
npm run db:reset                    # skapar tabeller och testdata i butik och butik_test
npm test                            # ska ge 79 gröna Jest-tester
.venv/Scripts/python -m pytest tests/legacy -q   # ska ge 20 gröna pytest-tester
npm start                           # API:t på http://localhost:3000
```

### Python och PYTHON på Windows

API:t räknar pris genom att starta `price_calc.py` med den tolk som miljövariabeln `PYTHON` pekar på, och med `python3` om den inte är satt. På Windows är `python3` ofta bara genvägen till Microsoft Store, och då ger `GET /orders/:id/price` 404.

- **Testerna** hittar `.venv` själva (`tests/helpers/env.ts`), så `npm test` fungerar utan att `PYTHON` är satt.
- **`npm start` och `npm run dev`:** sätt `PYTHON=.venv/Scripts/python.exe` i `.env`. På macOS och Linux fungerar oftast `python3`, eller `PYTHON=.venv/bin/python`.

Pröva API:t:

```bash
curl http://localhost:3000/customers/me -H "X-Customer-Id: 1"
curl http://localhost:3000/orders/1042/price -H "X-Customer-Id: 1"
```

`npm start` och `npm run db:reset` läser `.env` automatiskt. Testerna använder `TEST_DATABASE_URL`, och den äldre modulen `DATABASE_URL`.

## Kommandon

| Kommando | Vad det gör |
|---|---|
| `npm test` | Kör Jest-testerna mot testdatabasen: API:t och riggens hooks (79 tester). |
| `.venv/Scripts/python -m pytest tests/legacy -q` | Kör Python-testerna för den äldre prisberäkningen (20 tester). Fem av dem (`-m nodb`) behöver ingen databas. |
| `npm run test:legacy` | Samma som ovan, men kräver att `pytest` finns i PATH, alltså att `.venv` är aktiverad. Annars ger det `'pytest' is not recognized`. |
| `npm run lint` | ESLint med grundkonfiguration. |
| `npm run typecheck` | TypeScript utan att bygga. |
| `npm run format` | Formaterar koden med Prettier. |
| `npm run db:up` | Startar PostgreSQL i Docker. Kör det igen om testerna plötsligt ger `AggregateError`, eftersom databasen då troligen har stoppats. |
| `npm run db:reset` | Återställer båda databaserna till schema och testdata. |

## Struktur

```
src/
  app.ts, server.ts        API:t
  routes/                  endpoints
  services/                affärslogik, returnerar Result
  pricing/legacyPrice.ts   brygga till den äldre prisberäkningen
  legacy/price_calc.py     den äldre prisberäkningen
jobs/nightly_report.py     nattlig rapport som också använder price_calc
db/                        schema och testdata
tests/                     Jest-tester för API:t och hookarna (hooks.test.ts)
  legacy/                  pytest: karakteriserings- och enhetstester för price_calc.py
docs/
  standard.md              teamets kodstandard, i ord
  api.md                   endpoints
  user-stories.md          user stories att välja bland
  research-*.md, plan-*.md research och planer per arbete
  codemap-price-calc.md    karta över den äldre prisberäkningen
  migration-plan-price-calc.md  migreringsplan i expand/contract-steg
  adr/                     beslutsloggar
.claude/                   riggen
  settings.json            behörigheter (allow, ask, deny) och hooks
  skills/                  /tdd, /plan, /review
  agents/                  implementer, planner, researcher, reviewer
  hooks/                   testskydd, guard, kodkontroll (ESLint + tsc), minneskedja
sessions/                  sessionsloggar
```

## Ditt arbete

Projektbeskrivningen finns i kursens material. I korthet:

1. Bygg riggen i det här repot: skills och kommandon, subagenter, hooks, behörigheter och en kodstandard som kontrolleras automatiskt.
2. Använd riggen på tre arbeten: en ny funktion ur `docs/user-stories.md`, granskningen av pull requestet som kursledaren delar ut, och en modernisering av `src/legacy/price_calc.py`.
3. Skriv en sessionslogg i `sessions/` efter varje arbetspass.
4. Tagga repot `inlamning` när du lämnar in.

Testdatan är påhittad. Lägg aldrig in riktiga kunduppgifter eller produktionsdata i repot, i instruktioner eller i sessionsloggar.
