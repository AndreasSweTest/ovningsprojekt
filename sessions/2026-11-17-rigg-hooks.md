# Session 2026-11-17 – Riggens hooks

Branch: `feat/rigg-hooks` (från `main`). Uppgift: laga hookarna så att riggen uppfyller kursprojektets krav (minst fem hooks, minneskedja, kodstandard som kontrolleras automatiskt).

## Läge

<!-- auto:start -->
_Fylls i automatiskt av .claude/hooks/session-save.js, senast 11:48._

- **Branch:** `refactor/price-calc`
- **Senaste commit:** e6f2737 docs: sessionsloggen för hookarna, senaste auto-block

**Dagens commits:**
- e6f2737 docs: sessionsloggen för hookarna, senaste auto-block
- eb6dc78 docs: auto-blocket i sessionsloggen uppdaterat av Stop-hooken
- d5dd17a docs: hela sviten grön (79/79) och minneskedjan provad live
- 1dcc9d2 docs: städa tomma sessionsmallar och skriv sessionslogg för hookarna
- 2e89827 feat(rigg): koppla in alla sex hooks i settings.json
- 02dcf2e feat(rigg): guard-hook stoppar farliga kommandon och skrivning till .env
- 566c869 fix(rigg): session-load hoppar över tomma mallar
- 828b1a2 feat(rigg): minneskedja – Stop fyller i dagens logg, SessionStart laddar den senaste
- 91799b9 fix(rigg): tvinga LF i skalskript så att run-checks.sh fungerar efter checkout
- 2e6b584 feat(rigg): run-checks kör ESLint och tsc och stoppar med rättningstips
- bf83940 feat(rigg): testskyddet fungerar för Edit, Write och MultiEdit

**Ocommittade ändringar:**
- `?? docs/codemap-price-calc.md`
<!-- auto:end -->

Riggen har sex hooks, och alla är inkopplade i `.claude/settings.json`:

| Händelse | Matcher | Skript | Stoppar |
|---|---|---|---|
| SessionStart | – | `session-load.js` | – (ger agenten senaste loggens läge, vad som återstår och beslut) |
| PreToolUse | Edit\|Write\|MultiEdit | `block-test-removal.js` | tömda testfiler, borttagna testfall, skip-varianter |
| PreToolUse | Edit\|Write\|MultiEdit | `guard.js` | skrivning till `.env*` (utom `.env.example`) |
| PreToolUse | Bash\|PowerShell | `guard.js` | force-push, `reset --hard`, `--no-verify`, `rm -rf`, `git clean -f`, skrivning till `.env` |
| PostToolUse | Edit\|Write\|MultiEdit | `run-checks.sh` | ESLint- och tsc-fel (Prettier formaterar) |
| Stop | – | `session-save.js` | – (fyller i dagens logg med läget ur git, eller skapar en mall) |

Testerna ligger i `tests/hooks.test.ts` (39 tester). Ingen produktionskod i `src/` är ändrad.

## Vad fungerade (bevis)

**Tester:** `tests/hooks.test.ts` gick från rött till grönt för varje del och har 39 av 39 gröna. Lint och typecheck går igenom.

| Del | Före (rött) | Efter | Live-prov i sessionen |
|---|---|---|---|
| 1. Testskydd (`bf83940`) | 10 av 11 röda. Den gamla hooken stoppade **varje** Edit av en testfil, även tillägg, och släppte igenom alla skip-varianter. | 11 gröna | Edit med `it.skip` i `tests/customerSearch.test.ts` stoppades |
| 2. Kodstandard (`2e6b584`, `91799b9`) | 3 av 4 röda. Det gamla skriptet kördes aldrig: ett BOM-tecken bröt shebang-raden. | 4 gröna | En fil med typfel gav exit 2 med `TS2322`, rad och kolumn, och rättningstips |
| 3. Minneskedja (`828b1a2`, `566c869`) | 4 av 4 röda, sedan 1 rött när en tom mall laddades | 5 gröna | `session-load.js` laddar `sessions/2026-11-11-order-price.md` |
| 4. Guard (`02dcf2e`) | 17 av 17 röda | 17 gröna | `git clean -n -f` stoppades |
| 5. Inkoppling (`2e89827`) | – | 6 hooks i `settings.json` | Hookarna gällde direkt utan omstart |

**Vad kontrollerna fångade under passet** (underlag för mallens rutor "Vad kontrollerna fångade" och "Hur man ser att den fungerar"):

1. `run-checks.sh` stoppade 4 oanvända importer (`@typescript-eslint/no-unused-vars`) när jag lade till importer före koden som använder dem.
2. `run-checks.sh` stoppade `require()` i en testfil (`@typescript-eslint/no-require-imports`).
3. `block-test-removal.js` stoppade live-försöket med `it.skip`.
4. `guard.js` stoppade `git clean -f` live.
5. `guard.js` gav ett **falsklarm** på ett commit-meddelande som nämnde `git clean -f`. Det är rättat: text inom citattecken ignoreras, utom för `.env`-regeln. Två tester täcker fallet.

**Minneskedjan live:** när passets sista svar avslutades fyllde Stop-hooken i auto-blocket under "## Läge" i den här handskrivna loggen: branch, senaste commit och dagens åtta commits. Ingen ny fil skapades, och den handskrivna texten är orörd.

**Städat:** 20 tomma sessionsmallar från den gamla Stop-hooken är borttagna. 14 var ospårade och togs bort direkt. 6 var spårade och togs bort med `git rm`, så de finns kvar i historiken.

## Vad misslyckades

- **API-testerna (40 st) kunde först inte köras,** eftersom Docker Desktop inte var igång (`dockerDesktopLinuxEngine` saknas). Löst: Docker startades, sedan `npm run db:up`. Därefter var hela sviten grön, **79 av 79** (`orders`, `customers`, `customerSearch` och `hooks`). Lint och typecheck går också igenom.
- **Write-verktyget behöll BOM-tecknet** när filer skrevs om. Det bröt `run-checks.sh` igen tills tecknet togs bort med `sed`.
- **Git varnar för CRLF** på alla nya filer. För `*.sh` är det löst med `.gitattributes` (`eol=lf`). JS-filerna fungerar med CRLF.

## Vad återstår

- Öppna en PR för `feat/rigg-hooks` och merga till `main`.
- Valt bort, att motivera i mallen: egna ESLint-regler för `docs/standard.md`, till exempel ett förbud mot SQL i strängmallar och `no-console` i `src/`. De skulle göra fler regler kontrollerbara, men passet skulle inte röra produktionskonfigurationen.
- `run-checks.sh` kör `tsc` på hela projektet efter varje ändring, vilket tar cirka 1,5–3 sekunder. Det kan behöva mätas om projektet växer.
- Nästa steg i kursprojektet: PR-granskningen (arbete 2) och moderniseringen av `price_calc.py` (arbete 3).

## Beslut

- **`guard.js` kompletterar deny-reglerna i stället för att ersätta dem.** Deny stoppar tyst. Hooken säger vad som ska göras i stället, och den fångar också varianter som `git push -f` och `git push origin +main`.
- **Prettier rättar automatiskt men stoppar inte.** Att stoppa på formatering ger bara brus, eftersom felet rättas utan beslut.
- **`tsc` körs på hela projektet, inte bara på filen.** En ändring kan bryta typer i andra filer.
- **Stop-hooken skriver bara i ett markerat auto-block.** Det som skrivs för hand rörs aldrig, och högst en fil per dag skapas.
- **Fixtures i hook-testerna ligger i `tests/__hooktest__/` och tas bort efter testet,** så att `src/` inte rörs.
