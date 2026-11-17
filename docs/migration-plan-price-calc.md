# Migreringsplan: lagrade belopp och dataintegritet för prisberäkningen

Datum: 2026-11-17. Del av arbete 3 (modernisering). Underlag: `docs/codemap-price-calc.md` (P4–P6), karakteriseringstesterna i `tests/legacy/test_price_calc.py` och kontroller mot `butik_test` (avsnitt 5). **Det här är en plan. Ingen migrering är körd mot utvecklingsdatabasen, och ingen kod är ändrad.** SQL:en för spår B och steg A1 är provkörd upp och ner mot `butik_test` (avsnitt 6).

## 1. Varför databasen behöver ändras

| Problem idag | Följd |
|---|---|
| Priset **räknas om vid varje anrop** från rader och rabattkod. Inget belopp lagras. | Ändras `discounts.percent` i efterhand, ändras också priset på redan betalda ordrar och nattrapporten för gamla datum. Det finns ingen historik att stämma av mot. |
| Beloppen returneras som `str(Decimal)`: `"950"`, `"588.8"`, `"736.0"` (P4). | Bryter mot `docs/standard.md` ("strängar med två decimaler"). |
| Inga främmande nycklar eller CHECK-constraints. `orders.discount_code`, `order_lines.order_id` och `orders.customer_id` kan peka på något som inte finns, och `percent` och `status` kan ha vilka värden som helst. | Skräpdata ger tysta fel. En okänd rabattkod ignoreras till exempel (K7). |

Planen har två oberoende spår. **Spår A** lagrar beloppen per order. **Spår B** lägger till integritetsregler. Båda följer expand/contract: först läggs det nya till bredvid det gamla, sedan flyttas läsare och skrivare över, och sist stramas det gamla åt. Varje steg är en egen migrering med en `up`- och en `down`-fil och en egen commit.

## 2. Hur migreringarna läggs i repot

Projektet saknar migreringsverktyg. `db/schema.sql` körs om från början i varje test och vid `db:reset`. Förslaget:

- `db/migrations/NNN_namn.up.sql` och `NNN_namn.down.sql`, numrerade och körda i ordning med `psql -v ON_ERROR_STOP=1 -1 -f` (en transaktion per fil).
- `db/schema.sql` uppdateras så att det motsvarar läget **efter** varje migrering, så att testerna alltid kör mot det aktuella schemat.
- Varje `down` testas genom att köra `up` och sedan `down` mot `butik_test` och jämföra `pg_dump --schema-only` före och efter. Diffen ska vara tom (se avsnitt 6).

## 3. Spår A – lagrade belopp med två decimaler

| Steg | Typ | Vad | Går att backa? | Kontroll innan nästa steg |
|---|---|---|---|---|
| **A1** | Expand (schema) | Lägg till `orders.net_amount`, `vat_amount`, `total_amount` som `NUMERIC(12,2) NULL` och `priced_at TIMESTAMPTZ NULL`. Ingen kod läser eller skriver dem än. | **Ja.** `down` tar bort kolumnerna. De är tomma, så ingen data går förlorad. | `pg_dump`-diff efter `up` och `down` är tom. Alla tester gröna. |
| **A2** | Expand (data) | Backfill: ett skript fyller i kolumnerna för alla ordrar där `total_amount IS NULL`, med `price_calc.calc_price` (samma beräkning som idag, kapning inräknad). | **Ja.** `down`: `UPDATE orders SET net_amount = NULL, vat_amount = NULL, total_amount = NULL, priced_at = NULL`. Värdena kan räknas fram igen. | Kontrollfrågan i avsnitt 4 ger 0 avvikelser mellan lagrat och beräknat. |
| **A3** | Dubbelskrivning (kod) | När en order läggs eller ändras räknas priset med `price_from` och skrivs till kolumnerna. Läsarna räknar fortfarande om som idag. | **Ja.** Återställ koden. Kolumnerna finns kvar men skrivs inte. | Kontrollfrågan ger 0 avvikelser efter en tids drift. Ordrar skapade efter A3 har `priced_at`. |
| **A4** | Byt läsare (kod) | `GET /orders/:id/price` och `nightly_report.py` läser de lagrade beloppen och formaterar dem med två decimaler (`"950.00"`). **Kontraktet ändras.** K10 uppdateras i samma commit (`"950"` blir `"950.00"`), liksom `docs/api.md`. | **Ja.** Återställ koden. Det gamla räknesättet finns kvar. | API-testet (`Number(total) === 1187.5`) är oförändrat grönt. Nattrapporten ger samma summa. |
| **A5** | Contract (schema) | `ALTER COLUMN ... SET NOT NULL` på de tre beloppen och `priced_at`. Omräkningen vid läsning tas bort. `calc_price` används bara för att skriva. | **Ja**, med `DROP NOT NULL`. Ingen data tas bort. | En ny order utan pris avvisas av databasen. |

**Det som inte går att backa:** inget steg i planen tar bort data. Den enda åtgärd som inte går att ångra är att i framtiden ta bort kolumnerna efter A5, när läsarna förlitar sig på dem. Den ingår inte. A2 fryser dessutom dagens belopp för gamla ordrar. Det är avsikten, men det betyder att en senare ändring av rabattreglerna (P5) inte ändrar redan lagrade priser.

```sql
-- A1 up
ALTER TABLE orders
  ADD COLUMN net_amount   NUMERIC(12, 2),
  ADD COLUMN vat_amount   NUMERIC(12, 2),
  ADD COLUMN total_amount NUMERIC(12, 2),
  ADD COLUMN priced_at    TIMESTAMPTZ;

-- A1 down
ALTER TABLE orders
  DROP COLUMN priced_at,
  DROP COLUMN total_amount,
  DROP COLUMN vat_amount,
  DROP COLUMN net_amount;
```

## 4. Kontrollfråga för A2–A4

Körs innan läsarna byts i A4. Den räknar om priset ur raderna med samma regler som `price_from` (summa, rabatt, kapning och 25 % moms på det kapade nettot) och jämför med det lagrade värdet:

```sql
WITH beraknat AS (
  SELECT o.id,
         trunc(coalesce(sum(l.quantity * l.unit_price), 0)
               * (100 - coalesce(d.percent, 0)) / 100, 2) AS net
    FROM orders o
    LEFT JOIN order_lines l ON l.order_id = o.id
    LEFT JOIN discounts d   ON d.code = o.discount_code
   GROUP BY o.id, d.percent
)
SELECT o.id, o.net_amount, b.net
  FROM orders o JOIN beraknat b USING (id)
 WHERE o.net_amount IS DISTINCT FROM b.net
    OR o.vat_amount IS DISTINCT FROM trunc(b.net * 25 / 100, 2);
-- Förväntat: 0 rader.
```

## 5. Spår B – integritetsregler (NOT VALID, sedan VALIDATE)

Postgres kan lägga till en constraint som `NOT VALID`. Då kontrolleras **ny** data direkt, medan gamla rader inte läses och ingen långvarig låsning tas. `VALIDATE CONSTRAINT` kontrollerar sedan befintliga rader i ett separat steg.

**Kontroll mot seed-datan i `butik_test` (2026-11-17):** 0 rader utan order, 0 ordrar utan kund, 0 okända rabattkoder, 0 procentsatser utanför 0–100, och statusvärdena är `cancelled`, `new`, `paid` och `shipped`. Alla constraints går alltså att validera.

| Steg | Typ | Vad | Går att backa? |
|---|---|---|---|
| **B1** | Expand | Lägg till som `NOT VALID`: `order_lines.order_id → orders(id)`, `orders.customer_id → customers(id)`, `orders.discount_code → discounts(code)`, `CHECK (percent BETWEEN 0 AND 100)` och `CHECK (status IN ('new','paid','shipped','cancelled'))`. | **Ja.** `down`: `DROP CONSTRAINT` för alla fem. |
| **B2** | Contract | `VALIDATE CONSTRAINT` för alla fem. | **Ja.** `down`: `DROP CONSTRAINT`. Valideringen i sig ändrar ingen data. |

**Beteendet ändras med B1.** Den främmande nyckeln för `discount_code` gör det omöjligt att lägga in en order med en okänd rabattkod. Då kan K7 (`FINNSINTE` ignoreras) och K9 (`O'HARA`) inte längre förbereda sina testordrar. De testerna ska skrivas om **i samma commit som B1**, så att de förväntar sig att databasen avvisar koden. Testerna får aldrig tas bort. Om tyst ignorering av okända koder ska finnas kvar utelämnas just den nyckeln, och det beslutet tas innan B1.

```sql
-- B1 up
ALTER TABLE order_lines ADD CONSTRAINT order_lines_order_fk
  FOREIGN KEY (order_id) REFERENCES orders (id) NOT VALID;
ALTER TABLE orders ADD CONSTRAINT orders_customer_fk
  FOREIGN KEY (customer_id) REFERENCES customers (id) NOT VALID;
ALTER TABLE orders ADD CONSTRAINT orders_discount_fk
  FOREIGN KEY (discount_code) REFERENCES discounts (code) NOT VALID;
ALTER TABLE discounts ADD CONSTRAINT discounts_percent_range
  CHECK (percent BETWEEN 0 AND 100) NOT VALID;
ALTER TABLE orders ADD CONSTRAINT orders_status_known
  CHECK (status IN ('new', 'paid', 'shipped', 'cancelled')) NOT VALID;

-- B2 up
ALTER TABLE order_lines VALIDATE CONSTRAINT order_lines_order_fk;
ALTER TABLE orders      VALIDATE CONSTRAINT orders_customer_fk;
ALTER TABLE orders      VALIDATE CONSTRAINT orders_discount_fk;
ALTER TABLE discounts   VALIDATE CONSTRAINT discounts_percent_range;
ALTER TABLE orders      VALIDATE CONSTRAINT orders_status_known;

-- B1 down och B2 down (samma: constraints tas bort)
ALTER TABLE orders      DROP CONSTRAINT IF EXISTS orders_status_known;
ALTER TABLE discounts   DROP CONSTRAINT IF EXISTS discounts_percent_range;
ALTER TABLE orders      DROP CONSTRAINT IF EXISTS orders_discount_fk;
ALTER TABLE orders      DROP CONSTRAINT IF EXISTS orders_customer_fk;
ALTER TABLE order_lines DROP CONSTRAINT IF EXISTS order_lines_order_fk;
```

## 6. Provkörning mot butik_test

SQL-blocken ovan extraherades ur den här filen och kördes mot `butik_test` den 2026-11-17, med `psql -v ON_ERROR_STOP=1 -1`. Databasen återställdes till seed-datan före och efter körningen.

| Prov | Resultat |
|---|---|
| A1 `up` | Fyra kolumner tillagda (`net_amount`, `vat_amount`, `total_amount` som `numeric`, `priced_at` som `timestamptz`). |
| A2, provisorisk backfill med `calc_price` | 8 av 8 ordrar ifyllda. 1042 fick `total_amount = 1187.50` (två decimaler i databasen). |
| Kontrollfrågan (avsnitt 4) | **0 avvikelser** efter backfill. När momsen för 1044 hade ändrats med 1 öre gav den exakt en rad: `1044`. |
| A1 `down` | Schemat identiskt med före `up`. |
| B1 `up`, ny felaktig data | Avvisades alla fyra: rad utan order (`order_lines_order_fk`), procent 150 (`discounts_percent_range`), okänd status (`orders_status_known`) och okänd rabattkod som i K7 (`orders_discount_fk`). |
| B2 `up` | Alla fem constraints `convalidated = true` mot seed-datan. |
| B1 och B2 `down` | Schemat identiskt med före `up`. |

"Identiskt" betyder att `pg_dump --schema-only` före och efter är lika, bortsett från den slumpade `\restrict`-rad som `pg_dump` skriver i varje dump.

## 7. Ordning och beslut som behövs först

1. **Spår B först** (B1 och B2). Det kräver ingen kodändring utom K7 och K9, och det ger renare data inför backfill i A2.
2. **Spår A i ordning** A1 → A2 → A3 → A4 → A5. Kontrollfrågan ska ge 0 avvikelser före A4.

Utanför planen, eftersom de ändrar affärsregler och kräver beslut av "ekonomi" eller produktägaren:

- **P5, rabattens giltighetstid.** Order 1045 är betald med `GAMMAL15`, som gick ut 2024-12-31. A2 fryser dagens belopp (689,56 kr). Om regeln rättas gäller det bara ordrar som prissätts efter rättningen.
- **P6, status.** Ska avbrutna ordrar få ett lagrat pris? Med A3 skrivs priset när ordern läggs, oavsett status.
- **Avkortningen (K3)** ligger kvar. Filhuvudet säger att den inte får ändras utan ekonomis godkännande.
