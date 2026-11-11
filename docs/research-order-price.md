# Research: GET /orders/:id/price ger 404

Datum: 2026-11-11. Den här filen bygger på läsning av koden och några körningar av skriptet. Ingen kod är ändrad.

## Testet

`tests/orders.test.ts`, rad 65–71:

```ts
const res = await request(app).get("/orders/1042/price").set("X-Customer-Id", "1");
expect(res.status).toBe(200);
expect(Number(res.body.total)).toBe(1187.5);
```

Det förväntade värdet stämmer med seed-datan. Beställning 1042 har raderna 2 × 375,00 och 1 × 200,00 och ingen rabattkod. Det ger netto 950,00, moms 25 % = 237,50 och totalt 1187,50.

## Kedjan

1. `src/routes/orders.ts:31`: routen finns och är monterad. `parseId` godkänner 1042, och `getOrder(1042, 1)` lyckas, eftersom samma beställning ger 200 i testet för `GET /orders/:id`.
2. `src/pricing/legacyPrice.ts:12` kör `execFile("python3", [SCRIPT, "1042"])`.
3. `legacyPrice.ts:13–15`: **varje** fel från processen översätts till `err("not_found", …)`, och `sendResult` gör det till 404.

404:an betyder alltså inte att routen saknas. Den betyder att Python-anropet misslyckades.

## Orsak (verifierad på den här datorn)

Det finns två fel i miljön. Vart och ett räcker för att ge 404.

| # | Fel | Bevis |
|---|---|---|
| 1 | `python3` är Windows genväg till Microsoft Store, ingen riktig Python. | `where python3` ger `…\WindowsApps\python3.exe`. Körningen skriver "Python hittades inte; kör utan argument för att installera från Microsoft Store…" och avslutas med kod 49. |
| 2 | `psycopg` är inte installerat i någon av de Python-installationer som finns (3.13, 3.14, 3.15), och projektet har ingen virtuell miljö. | `python src/legacy/price_calc.py 1042` ger `ModuleNotFoundError: No module named 'psycopg'`. `requirements.txt` kräver `psycopg[binary]==3.2.3`, och README:n säger `pip install -r requirements.txt`. |

Även om `python3` hade pekat på en riktig Python hade importen av `psycopg` fallerat.

## Andra iakttagelser (ingår inte i fixen)

- **Fel döljs.** `legacyPrice.ts` gör alla fel till `not_found` och kastar bort stderr. Därför var felet svårt att hitta. Ett saknat program, en saknad modul eller ett databasfel borde ge 500, inte 404.
- **SQL byggs med strängformatering** i `price_calc.py` (rad 30, 36 och 42, `"... %s" % order_id` och `'%s'` runt rabattkoden). Det bryter mot regeln "All SQL parametriserad". `order_id` är ett heltal från `int(sys.argv[1])`, men `discount_code` kommer från databasen och sätts in utan escape. Filhuvudet säger att avrundningen inte får röras, och därför bör ändringen göras separat med karakteriseringstester.
- **`JSON.parse(stdout)`** på `legacyPrice.ts:17` kan kasta om skriptet skriver något annat än JSON. Det sker inne i en callback, så felet fångas inte.
- **Loggfilen** `src/legacy/price_calc.log` får en rad per anrop. Raden innehåller tid, order-id och totalbelopp, inga personuppgifter. Filen finns i `.gitignore`.
- **Testet är beroende av miljön.** Det kräver Python och `psycopg` utöver Docker-databasen, men det står inte i felmeddelandet eller vid testet.

## Förslag på minsta fix

**Steg 1: miljö (ingen kod).** Skapa en virtuell miljö i projektet och installera beroendena:

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
```

**Steg 2: en rad kod.** Låt Python-kommandot styras av en miljövariabel med `python3` som standard, så att Linux och macOS beter sig som förut:

```ts
// src/pricing/legacyPrice.ts
const PYTHON = process.env.PYTHON ?? "python3";
execFile(PYTHON, [SCRIPT, String(orderId)], …)
```

Lägg sedan `PYTHON=.venv/Scripts/python.exe` i `.env` (lokalt), och `PYTHON=` med en kommentar i `.env.example`. Jest läser inte `.env`. För testerna sätts variabeln därför i `tests/helpers/env.ts` med samma `??`-mönster som `DATABASE_URL`, eller i skalet innan `npm test` körs.

Med båda stegen ska testet bli grönt utan att routen, prisskriptet eller testet ändras.

**Alternativ som inte rekommenderas:**
- Att ändra `"python3"` till `"python"`. Det fungerar här men kan gå sönder på Linux och macOS, där `python` saknas eller är Python 2.
- Att installera `psycopg` globalt och stänga av appkörningsaliaset för `python3` i Windows-inställningarna. Det ger ingen kodändring, men fixen hamnar då utanför repot och måste göras om på varje dator.
- Att ändra testet. Det är inte tillåtet.

## Genomfört 2026-11-11

- Den virtuella miljön `.venv` skapades med **Python 3.13** (`py -3.13 -m venv .venv`). Det låsta `psycopg-binary==3.2.3` har inga färdigbyggda paket för Python 3.15, som `python` pekar på här.
- `tests/helpers/env.ts` sätter `PYTHON` till `.venv` om den finns (`Scripts/python.exe` på Windows och `bin/python` annars). Sätts inget används `python3` som förut.
- Resultat: 40 av 40 tester gröna.

## Uppföljning (separat)

- Låt `legacyPrice.ts` skilja på "beställningen finns inte" (skriptet avslutas med 1 och skriver `{"error":"finns inte"}`) och andra fel (500), och skicka stderr till en logg utan personuppgifter.
- Parametrisera SQL i `price_calc.py`, med karakteriseringstester först.
