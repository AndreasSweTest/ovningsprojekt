# Session 2026-11-09 – Granskning av kundsökningen (/review)

Branch: `feat/customer-search`. Föregående pass: `sessions/2026-11-09-kundsokning.md`.

## Läge

Det här passet granskade kundsökningen (`GET /customers?q=`) med `/review` på nivån high. Ingen kod ändrades, och bara den här loggen är ny.

Granskningen gällde diffen mot `main` i `src/routes/customers.ts` och `src/services/customerService.ts`, och dessutom `tests/customerSearch.test.ts`. Måttstockar var `CLAUDE.md`, `docs/standard.md` och `docs/plan-kundsokning.md`.

Användaren avbröt passet innan granskningens slutsteg. Fynden nedan bygger på det som hann gås igenom: alla vinklar för korrekthet, städning, nivå och konventioner, men utan någon separat verifiering.

## Vad fungerade (bevis)

- All SQL är parametriserad, även `LIMIT $2`. `escapeLike` escapar `\`, `%` och `_` i en enda körning.
- Inga överträdelser av reglerna i `CLAUDE.md` eller `docs/standard.md` hittades. Den statiska mallsträngen i SQL-frågan saknar interpolering, så den räknas inte som en strängbyggd fråga.
- Felmeddelandet innehåller aldrig söktermen, och ingenting loggas.
- Testerna från föregående pass var verifierade med mutationer (sex av sex gav rött). Hela sviten var då 39 av 40 gröna. Testerna kördes inte om i det här passet, eftersom ingen kod ändrades.

## Vad misslyckades

Granskningen gav sju fynd, allvarligast först:

1. **Nivå:** routen saknar felhantering för async-fel. Alla databasfel utom nollbyte, till exempel en tappad anslutning eller en timeout, får fortfarande anropet att hänga. Nollbytekontrollen lagar ett symptom. Rätt åtgärd är en felmiddleware eller en `asyncHandler` i `createApp`, och ett förslag om en egen session för det finns redan.
2. **Säkerhet:** `requireCustomer` slår aldrig upp id:t, så vem som helst kan söka fram namn och e-post. Det är medvetet och dokumenterat i ADR 0001, men det är fortfarande den största risken.
3. **Korrekthet:** ett `q` med nollbyte ger meddelandet "q måste vara 2–100 tecken." även när längden är giltig, till exempel för `ab%00cd`.
4. **Korrekthet:** längden räknas i kodpunkter, inte i synliga tecken. Ett `é` skrivet med kombinerande tecken, eller en familjeemoji, klarar `MIN_Q`. Det beslutet står inte i `docs/api.md`.
5. **Nivå:** typkontrollen av `q` ligger i routen och inte i `searchCustomers(q: unknown)`, som planen säger.
6. **Effektivitet:** testhjälparen `addCustomers` gör en INSERT per kund, alltså 51 frågor i rad i taktestet.
7. **Städning:** kommentaren om nollbyte står ovanför längdberäkningen i stället för ovanför villkoret.

## Vad återstår

- Besluta vilka fynd som ska åtgärdas. Fynd 3, 5 och 7 är små, fynd 4 kräver ett beslut, och fynd 1 hör till den föreslagna sessionen för felhantering.
- Rollkontroll enligt ADR 0001 innan endpointen går i produktion (fynd 2).
- Allt som står under "Vad återstår" i `sessions/2026-11-09-kundsokning.md` gäller fortfarande: hookarna, en del KAN-fynd från den första granskningen och Prettier-varningar utanför storyn.
- Stop-hooken har skapat tomma mallar i `sessions/` (`2026-11-09T08-*.md`). De är inte committade.

## Beslut

- Inga nya beslut i det här passet. Fynden ovan är underlag för nästa pass och är inte åtgärdade.
