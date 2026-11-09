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

  // Kriterium 11
  it("returnerar 401 utan inloggning", async () => {
    const res = await request(app).get("/customers").query({ q: "lind" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });
});
