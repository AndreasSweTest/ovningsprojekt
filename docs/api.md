# API

Alla anrop utom `POST /customers` och `/health` kräver headern `X-Customer-Id` med den inloggade kundens id. Det är en förenklad inloggning för övningen.

| Metod och sökväg | Beskrivning | Svar |
|---|---|---|
| `GET /health` | Kontroll att API:t kör. | 200 |
| `POST /customers` | Registrera en kund. Body: `{ name, email }`. | 201, 400 |
| `GET /customers?q=<term>` | Sök kunder på en del av namnet eller e-postadressen. Skiftläget spelar ingen roll, och `%`, `_` och `\` tolkas bokstavligt. Termen trimmas och ska vara 2–100 tecken. Svaret är högst 50 träffar `[{ id, uuid, name, email }]`, sorterade på namn och sedan id. Ingen träff ger `[]`. **Se varningen nedan.** | 200, 400, 401 |
| `GET /customers/me` | Den inloggade kunden. | 200, 401, 404 |
| `GET /customers/me/orders` | Den inloggade kundens beställningar, nyast först. | 200, 401 |
| `POST /orders` | Lägg en beställning. Body: `{ lines: [{ product, quantity, unitPrice }], discountCode? }`. | 201, 400, 401 |
| `GET /orders/:id` | En egen beställning med rader. | 200, 400, 401, 403, 404 |
| `GET /orders/:id/price` | Pris för en egen beställning: `{ net, vat, total }`. Räknas av den äldre modulen. | 200, 400, 401, 403, 404 |

## Varning: kundsökningen saknar rollkontroll

`GET /customers?q=` är tänkt för kundtjänst, men just nu kontrolleras bara att anroparen är inloggad. **Alla inloggade kunder kan alltså söka fram andra kunders namn och e-post.** Det är ett medvetet, tillfälligt beslut, och endpointen får inte gå i produktion i det här skicket. Se [ADR 0001](adr/0001-kundsokning-utan-roll.md) för konsekvenserna och planen för en rollkontroll (403 för vanliga kunder).

## Den äldre modulen

`src/legacy/price_calc.py` räknar pris, rabatt och moms för en beställning. Den är skriven i Python, saknar tester och dokumentation och anropas från två ställen: API:t (via `src/pricing/legacyPrice.ts`) och den nattliga rapporten `jobs/nightly_report.py`.

Den går att köra direkt:

```bash
python3 src/legacy/price_calc.py 1042
```
