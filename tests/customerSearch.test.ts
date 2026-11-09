import request from "supertest";
import { createApp } from "../src/app";
import { db } from "../src/db";
import { closeDb, resetDb } from "./helpers/db";

const app = createApp();

beforeEach(resetDb);
afterAll(closeDb);

// Lägger in fiktiva testkunder med e-post på example.com.
async function addCustomers(names: string[]): Promise<void> {
  for (const [i, name] of names.entries()) {
    await db.query("INSERT INTO customers (name, email) VALUES ($1, $2)", [
      name,
      `testkund${i}@example.com`,
    ]);
  }
}

// Kundsökning, se docs/plan-kundsokning.md.
describe("GET /customers?q=", () => {
  // Kriterium 1
  it("hittar en kund på en del av namnet", async () => {
    const res = await request(app).get("/customers").query({ q: "lind" }).set("X-Customer-Id", "1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({ id: 1, name: "Alva Lind", email: "alva.lind@example.com" }),
    ]);
  });

  // Kriterium 2
  it("hittar en kund på en del av e-postadressen", async () => {
    const res = await request(app)
      .get("/customers")
      .query({ q: "farid.h" })
      .set("X-Customer-Id", "1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ name: "Farid Haddad" })]);
  });

  // Kriterium 3
  it("bryr sig inte om skiftläge, inte heller för å, ä och ö", async () => {
    const res = await request(app)
      .get("/customers")
      .query({ q: "NYSTRÖM" })
      .set("X-Customer-Id", "1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ name: "Hugo Nyström" })]);
  });

  // Kriterium 4
  it("returnerar tom lista när ingen kund matchar", async () => {
    const res = await request(app).get("/customers").query({ q: "zzzz" }).set("X-Customer-Id", "1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // Kriterium 5
  it("returnerar 400 när q saknas", async () => {
    const res = await request(app).get("/customers").set("X-Customer-Id", "1");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_input");
  });

  it.each(["", "   "])("returnerar 400 när q är %j", async (q) => {
    const res = await request(app).get("/customers").query({ q }).set("X-Customer-Id", "1");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_input");
  });

  // Kriterium 6
  it("returnerar 400 när q är kortare än 2 tecken", async () => {
    const res = await request(app).get("/customers").query({ q: "a" }).set("X-Customer-Id", "1");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_input");
  });

  // Kriterium 7
  it("returnerar 400 när q är längre än 100 tecken", async () => {
    const res = await request(app)
      .get("/customers")
      .query({ q: "a".repeat(101) })
      .set("X-Customer-Id", "1");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_input");
  });

  // Kriterium 8
  it("returnerar 400 när q skickas flera gånger", async () => {
    const res = await request(app).get("/customers?q=lind&q=berg").set("X-Customer-Id", "1");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_input");
  });

  // Kriterium 9
  it.each(["%%", "__"])("tolkar jokertecknen i %j bokstavligt", async (q) => {
    const res = await request(app).get("/customers").query({ q }).set("X-Customer-Id", "1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // Kriterium 10
  it("sorterar träffarna på namn och sedan id", async () => {
    await addCustomers(["Aaron Test", "Aaron Test"]); // får id 101 och 102
    const res = await request(app)
      .get("/customers")
      .query({ q: "example.com" })
      .set("X-Customer-Id", "1");
    expect(res.status).toBe(200);
    expect(res.body.map((c: { id: number }) => c.id)).toEqual([101, 102, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("returnerar högst 50 träffar", async () => {
    await addCustomers(Array.from({ length: 51 }, (_, i) => `Testkund ${i}`));
    const res = await request(app)
      .get("/customers")
      .query({ q: "example.com" })
      .set("X-Customer-Id", "1");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(50);
  });

  // Kriterium 11
  it("returnerar 401 utan inloggning", async () => {
    const res = await request(app).get("/customers").query({ q: "lind" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  // Kriterium 12
  it("är opåverkad av SQL-injektion i q", async () => {
    const res = await request(app)
      .get("/customers")
      .query({ q: "' OR 1=1 --" })
      .set("X-Customer-Id", "1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// Fynd från granskningen 2026-11-09.
describe("GET /customers?q= – gränsfall från granskningen", () => {
  it("returnerar 400 när q innehåller nollbyte", async () => {
    const res = await request(app).get("/customers?q=%00%00").set("X-Customer-Id", "1");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_input");
  });

  it("räknar längden i tecken: en emoji är för kort", async () => {
    const res = await request(app).get("/customers").query({ q: "😀" }).set("X-Customer-Id", "1");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_input");
  });

  it("räknar längden i tecken: 100 emojis är tillåtet", async () => {
    const res = await request(app)
      .get("/customers")
      .query({ q: "😀".repeat(100) })
      .set("X-Customer-Id", "1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
