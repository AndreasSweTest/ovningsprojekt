// Tester för riggens hooks i .claude/hooks/. Varje hook får samma JSON på stdin som Claude Code skickar.
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..");
const HOOKS = path.join(ROOT, ".claude", "hooks");

// Mönstren byggs ihop här så att testskyddet inte stoppar själva testfilen.
const SKIPS = ["it", "describe", "test"]
  .map((f) => f + ".skip")
  .concat(["x" + "test", "x" + "it", "x" + "describe"]);

function runNode(hook: string, input: unknown) {
  const res = spawnSync(process.execPath, [path.join(HOOKS, hook)], {
    input: JSON.stringify(input),
    encoding: "utf8",
    cwd: ROOT,
  });
  return { code: res.status, out: res.stdout, err: res.stderr };
}

describe("block-test-removal.js (PreToolUse Edit|Write)", () => {
  const testFile = path.join(ROOT, "tests", "x.test.ts");
  const edit = (old_string: string, new_string: string) =>
    runNode("block-test-removal.js", {
      tool_name: "Edit",
      tool_input: { file_path: testFile, old_string, new_string },
    });

  it("släpper igenom en Edit som lägger till ett test", () => {
    expect(edit('it("a", () => {});', 'it("a", () => {});\nit("b", () => {});').code).toBe(0);
  });

  it.each(SKIPS)("stoppar en Edit som lägger in %s", (pattern) => {
    const r = edit('it("a", () => {});', `${pattern}("a", () => {});`);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/stänger av eller hoppar över/);
  });

  it("stoppar en Edit som tar bort ett test", () => {
    const r = edit('it("a", () => {});\nit("b", () => {});', 'it("a", () => {});');
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/tar bort 1 test/);
  });

  it("stoppar en Write som tömmer en befintlig testfil", () => {
    const r = runNode("block-test-removal.js", {
      tool_name: "Write",
      tool_input: { file_path: path.join(ROOT, "tests", "customers.test.ts"), content: "" },
    });
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/tömmer/);
  });

  it("stoppar en Write som lägger in en skip-variant", () => {
    const r = runNode("block-test-removal.js", {
      tool_name: "Write",
      tool_input: { file_path: testFile, content: `${SKIPS[0]}("a", () => {});\n` },
    });
    expect(r.code).toBe(2);
  });

  it("bryr sig inte om filer som inte är tester", () => {
    const r = runNode("block-test-removal.js", {
      tool_name: "Edit",
      tool_input: {
        file_path: path.join(ROOT, "src", "app.ts"),
        old_string: "it(",
        new_string: "",
      },
    });
    expect(r.code).toBe(0);
  });
});

function runBash(hook: string, input: unknown) {
  const res = spawnSync("bash", [path.join(HOOKS, hook)], {
    input: JSON.stringify(input),
    encoding: "utf8",
    cwd: ROOT,
  });
  return { code: res.status, out: res.stdout, err: res.stderr };
}

describe("run-checks.sh (PostToolUse Edit|Write)", () => {
  // Tillfälliga filer under tests/, så att produktionskoden i src/ inte rörs.
  const dir = path.join(ROOT, "tests", "__hooktest__");
  const fixture = (name: string, code: string) => {
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, name);
    writeFileSync(file, code);
    return file;
  };
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("släpper igenom filer som inte är TypeScript", () => {
    expect(runBash("run-checks.sh", { tool_input: { file_path: "README.md" } }).code).toBe(0);
  });

  it("släpper igenom en korrekt TypeScript-fil", () => {
    const file = fixture("ok.ts", "export const ok = (n: number): number => n + 1;\n");
    const r = runBash("run-checks.sh", { tool_input: { file_path: file } });
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
  }, 120000);

  it("stoppar ett ESLint-fel och säger hur det rättas", () => {
    const file = fixture("lint.ts", "export const f = (x: any): number => x;\n");
    const r = runBash("run-checks.sh", { tool_input: { file_path: file } });
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/ESLint/);
    expect(r.err).toMatch(/no-explicit-any/);
    expect(r.err).toMatch(/Så rättar du/);
  }, 120000);

  it("stoppar ett typfel och säger hur det rättas", () => {
    const file = fixture("type.ts", 'export const n: number = "inte ett tal";\n');
    const r = runBash("run-checks.sh", { tool_input: { file_path: file } });
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/TypeScript/);
    expect(r.err).toMatch(/TS2322/);
    expect(r.err).toMatch(/Så rättar du/);
  }, 120000);
});
