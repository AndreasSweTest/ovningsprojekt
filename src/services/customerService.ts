import { db } from "../db";
import { Result, ok, err } from "../result";

export type Customer = { id: number; uuid: string; name: string; email: string };

export type OrderSummary = { id: number; status: string; createdAt: string };

export async function createCustomer(input: {
  name?: unknown;
  email?: unknown;
}): Promise<Result<Customer>> {
  if (typeof input.name !== "string" || input.name.trim() === "") {
    return err("invalid_input", "name saknas.");
  }
  if (typeof input.email !== "string" || input.email.trim() === "") {
    return err("invalid_input", "email saknas.");
  }
  const res = await db.query(
    "INSERT INTO customers (name, email) VALUES ($1, $2) RETURNING id, uuid, name, email",
    [input.name.trim(), input.email.trim()],
  );
  return ok(res.rows[0]);
}

export async function getCustomer(id: number): Promise<Result<Customer>> {
  const res = await db.query("SELECT id, uuid, name, email FROM customers WHERE id = $1", [id]);
  if (res.rowCount === 0) {
    return err("not_found", `Kund ${id} finns inte.`);
  }
  return ok(res.rows[0]);
}

export const MIN_Q = 2;
export const MAX_Q = 100;
export const SEARCH_LIMIT = 50;

// Gör \, % och _ till vanliga tecken i ett LIKE-mönster (Postgres standard-escape är \).
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, "\\$&");
}

// Söker på del av namn eller e-post. Söktermen får aldrig hamna i felmeddelanden eller loggar.
export async function searchCustomers(q: string): Promise<Result<Customer[]>> {
  const term = q.trim();
  // Postgres avvisar nollbyte i text, så de stoppas här i stället för att ge ett DB-fel.
  if (term.length < MIN_Q || term.length > MAX_Q || term.includes("\0")) {
    return err("invalid_input", `q måste vara ${MIN_Q}–${MAX_Q} tecken.`);
  }
  const res = await db.query(
    `SELECT id, uuid, name, email FROM customers
      WHERE name ILIKE $1 OR email ILIKE $1
      ORDER BY name, id
      LIMIT $2`,
    [`%${escapeLike(term)}%`, SEARCH_LIMIT],
  );
  return ok(res.rows);
}

export async function listOrdersForCustomer(customerId: number): Promise<OrderSummary[]> {
  const res = await db.query(
    `SELECT id, status, created_at AS "createdAt"
       FROM orders WHERE customer_id = $1 ORDER BY created_at DESC`,
    [customerId],
  );
  return res.rows;
}
