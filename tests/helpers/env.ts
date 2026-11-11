import { existsSync } from "node:fs";
import path from "node:path";

// Testerna körs alltid mot testdatabasen.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/butik_test";

// Använd projektets .venv för den äldre prisberäkningen om den finns (se docs/research-order-price.md).
if (!process.env.PYTHON) {
  const root = path.join(__dirname, "..", "..");
  const venvPython = [
    path.join(root, ".venv", "Scripts", "python.exe"),
    path.join(root, ".venv", "bin", "python"),
  ].find((p) => existsSync(p));
  if (venvPython) process.env.PYTHON = venvPython;
}
