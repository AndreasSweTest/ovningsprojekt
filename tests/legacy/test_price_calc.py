"""Karakteriseringstester för den äldre prisberäkningen (src/legacy/price_calc.py).

Testerna låser DAGENS beteende, även kända buggar, så att refaktoreringen inte ändrar något av misstag.
En bugg rättas i ett eget, medvetet steg: då ändras förväntan här i samma commit, och testet tas aldrig bort.
Se docs/codemap-price-calc.md (avsnitt 5) för K1–K11.

Körs mot testdatabasen, som återställs till db/schema.sql + db/seed.sql före varje test:
    .venv/Scripts/python -m pytest tests/legacy -q
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import psycopg
import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "src" / "legacy" / "price_calc.py"
REPORT = ROOT / "jobs" / "nightly_report.py"
TEST_DB = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/butik_test"
)

# Säkerhetsspärr: testerna skriver om hela databasen, så de får bara köras mot en testdatabas.
assert TEST_DB.rstrip("/").endswith("_test"), f"Vägrar köra mot {TEST_DB}: inte en testdatabas."


@pytest.fixture(autouse=True)
def reset_db():
    sql = "\n".join((ROOT / "db" / f).read_text(encoding="utf-8") for f in ("schema.sql", "seed.sql"))
    with psycopg.connect(TEST_DB, autocommit=True) as conn:
        conn.execute("SET client_min_messages TO warning")
        conn.execute(sql)


def add_order(order_id, discount_code, lines):
    """Lägger in en fiktiv testorder med parametriserad SQL."""
    with psycopg.connect(TEST_DB, autocommit=True) as conn:
        conn.execute(
            "INSERT INTO orders (id, customer_id, status, discount_code) VALUES (%s, 1, 'paid', %s)",
            (order_id, discount_code),
        )
        for qty, price in lines:
            conn.execute(
                "INSERT INTO order_lines (order_id, product, quantity, unit_price) VALUES (%s, 'Test', %s, %s)",
                (order_id, qty, price),
            )


def run(script, *args):
    env = {**os.environ, "DATABASE_URL": TEST_DB}
    res = subprocess.run(
        [sys.executable, str(script), *map(str, args)],
        capture_output=True, text=True, env=env, timeout=60,
    )
    return res.returncode, res.stdout.strip(), res.stderr


def price(order_id):
    code, out, err = run(SCRIPT, order_id)
    assert code == 0, err
    return out


# K1
def test_pris_utan_rabatt():
    assert price(1042) == '{"net": "950", "vat": "237.5", "total": "1187.5"}'


# K2
def test_giltig_procentrabatt_dras_fore_moms():
    assert price(1041) == '{"net": "588.8", "vat": "147.2", "total": "736.0"}'


# K3 – avkortning, inte avrundning (filhuvudet: "rör inte avrundningen")
def test_momsen_kapas_till_tva_decimaler():
    assert price(1044) == '{"net": "179.91", "vat": "44.97", "total": "224.88"}'


# K4 – KÄND BUGG: giltighetstiden för rabattkoden ignoreras (GAMMAL15 gick ut 2024-12-31)
def test_utgangen_rabatt_dras_anda():
    assert price(1045) == '{"net": "551.65", "vat": "137.91", "total": "689.56"}'


# K5 – KÄND BUGG: orderns status ignoreras
def test_avbruten_order_prissatts():
    assert price(1046) == '{"net": "899", "vat": "224.75", "total": "1123.75"}'


# K6
def test_order_utan_rader_kostar_noll():
    assert price(1043) == '{"net": "0", "vat": "0", "total": "0"}'


# K7
def test_okand_rabattkod_ignoreras():
    add_order(3002, "FINNSINTE", [(1, "100.00")])
    assert price(3002) == '{"net": "100", "vat": "25", "total": "125"}'


# K8 – felkontraktet som src/pricing/legacyPrice.ts bygger på
def test_order_som_saknas_ger_fel_och_exit_1():
    code, out, _ = run(SCRIPT, 9999)
    assert code == 1
    assert json.loads(out) == {"error": "finns inte"}


# K9 – Rättat i refaktoreringssteg 1 (parametriserad SQL). Tidigare kraschade en rabattkod med
# apostrof beräkningen med psycopg.errors.SyntaxError. Nu är koden ett vanligt värde: den finns inte
# i discounts och ignoreras därför, precis som i K7.
def test_rabattkod_med_apostrof_behandlas_som_vanligt_varde():
    add_order(3001, "O'HARA", [(1, "100.00")])
    assert price(3001) == '{"net": "100", "vat": "25", "total": "125"}'


# K10 – KÄND AVVIKELSE från docs/standard.md: beloppen har inte fasta två decimaler
def test_belopp_formateras_utan_fasta_decimaler():
    prices = [json.loads(price(1042)), json.loads(price(1043))]
    assert prices[0]["net"] == "950"
    assert prices[1]["total"] == "0"


# K11 – rapportvägen (importerar calc_price och conn direkt ur price_calc)
def test_nattrapporten_summerar_dagens_betalda_ordrar():
    code, out, err = run(REPORT, "2026-10-05")
    assert code == 0, err
    assert out == "2026-10-05: 1 betalda ordrar, totalt 224.88 kr"


def test_nattrapporten_utan_ordrar():
    code, out, err = run(REPORT, "2026-01-01")
    assert code == 0, err
    assert out == "2026-01-01: 0 betalda ordrar, totalt 0 kr"


# Refaktoreringssteg 1: datumet är ett värde, inte SQL. Före steget gav argumentet nedan
# "8 betalda ordrar, totalt 5746.69 kr" – alla ordrar, även avbrutna och obetalda.
def test_nattrapporten_tolkar_datumet_som_varde():
    code, out, _ = run(REPORT, "2026-10-05' or '1'='1")
    assert code != 0
    assert "betalda ordrar" not in out
