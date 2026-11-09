import request from "supertest";
import { createApp } from "../src/app";
import { closeDb, resetDb } from "./helpers/db";

const app = createApp();

beforeEach(resetDb);
afterAll(closeDb);

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
    const res = await request(app).get("/customers").query({ q: "farid.h" }).set("X-Customer-Id", "1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ name: "Farid Haddad" })]);
  });

  // Kriterium 4
  it("returnerar tom lista när ingen kund matchar", async () => {
    const res = await request(app).get("/customers").query({ q: "zzzz" }).set("X-Customer-Id", "1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // Kriterium 6
  it("returnerar 400 när q är kortare än 2 tecken", async () => {
    const res = await request(app).get("/customers").query({ q: "a" }).set("X-Customer-Id", "1");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_input");
  });

  // Kriterium 11
  it("returnerar 401 utan inloggning", async () => {
    const res = await request(app).get("/customers").query({ q: "lind" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });
});
