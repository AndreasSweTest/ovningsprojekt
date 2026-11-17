# price_calc.py
# prisberakning for ordrar. skriven 2019, flyttad hit fran gamla admin-systemet.
# OBS rör inte avrundningen, ekonomi har stämt av mot den.

import os, sys, json, datetime
from decimal import Decimal
import psycopg

DB = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/butik")

MOMS = 25
LOGG = os.path.join(os.path.dirname(__file__), "price_calc.log")


class Pris:
    def __init__(self, net, vat, total):
        self.net = net
        self.vat = vat
        self.total = total


def _kapa(x):
    # två decimaler
    return Decimal(int(x * 100)) / 100


def price_from(lines, percent=None):
    # ren beräkning utan databas och loggfil: rader (antal, styckpris) och rabatt i procent (None = ingen)
    summa = Decimal(0)
    for q, p in lines:
        summa = summa + q * p

    if percent is not None:
        summa = summa - summa * percent / 100

    net = _kapa(summa)
    vat = _kapa(net * MOMS / 100)
    total = net + vat
    return Pris(net, vat, total)


def connect():
    # uppkopplingen skapas när den behövs, inte när modulen importeras
    return psycopg.connect(DB, autocommit=True)


def calc_price(order_id, conn=None):
    # utan conn öppnas och stängs en egen uppkoppling för just det här anropet
    if conn is None:
        with connect() as egen:
            return calc_price(order_id, egen)

    cur = conn.cursor()
    cur.execute("select discount_code from orders where id = %s", (order_id,))
    rad = cur.fetchone()
    if rad == None:
        return None
    kod = rad[0]

    cur.execute("select quantity, unit_price from order_lines where order_id = %s", (order_id,))
    lines = cur.fetchall()

    percent = None
    if kod:
        cur.execute("select percent from discounts where code = %s", (kod,))
        r = cur.fetchone()
        if r:
            percent = r[0]

    pris = price_from(lines, percent)

    try:
        f = open(LOGG, "a")
        f.write("%s %s %s\n" % (datetime.datetime.now().isoformat(), order_id, pris.total))
        f.close()
    except:
        pass

    return pris


if __name__ == "__main__":
    p = calc_price(int(sys.argv[1]))
    if p is None:
        print(json.dumps({"error": "finns inte"}))
        sys.exit(1)
    print(json.dumps({"net": str(p.net), "vat": str(p.vat), "total": str(p.total)}))
