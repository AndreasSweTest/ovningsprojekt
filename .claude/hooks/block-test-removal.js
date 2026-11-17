#!/usr/bin/env node
// PreToolUse (Edit|Write|MultiEdit): stoppar ändringar som tar bort eller stänger av tester.
// Regel i CLAUDE.md och kursprojektet: agenten får föreslå ändringar i tester men aldrig ta bort eller stänga av dem.
const fs = require("fs");

// Skip-varianter i Jest. Byggs ihop så att den här filen inte själv innehåller mönstren ordagrant.
const SKIP = new RegExp(
  "\\b(?:it|test|describe)\\.skip\\b|\\b(?:xit|xtest|xdescribe)\\s*\\(",
  "g",
);
// Ett testfall: it(...), test(...), it.each(...), test.each(...).
const TESTCASE = /\b(?:it|test)(?:\.each)?\s*\(/g;

const count = (text, re) => (String(text || "").match(re) || []).length;

function isTestFile(filePath) {
  const p = String(filePath || "").replace(/\\/g, "/");
  return /\.test\.[cm]?[jt]sx?$/.test(p) || /(^|\/)tests\//.test(p);
}

// Returnerar [före, efter] för ändringen, oavsett verktyg.
function beforeAfter(tool, input) {
  if (tool === "Edit") return [input.old_string, input.new_string];
  if (tool === "MultiEdit") {
    const edits = input.edits || [];
    return [edits.map((e) => e.old_string).join("\n"), edits.map((e) => e.new_string).join("\n")];
  }
  // Write: jämför med filen som den ser ut nu.
  let existing = "";
  try {
    existing = fs.readFileSync(input.file_path, "utf8");
  } catch {
    existing = "";
  }
  return [existing, input.content];
}

function block(message) {
  process.stderr.write(
    `HOOK BLOCK (block-test-removal): ${message}\n` +
      "Agenten får aldrig ta bort eller stänga av tester (CLAUDE.md). " +
      "Rätta koden så att testet går igenom i stället, eller fråga användaren om testet är fel.\n",
  );
  process.exit(2);
}

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let data;
  try {
    data = JSON.parse(raw || "{}");
  } catch {
    process.exit(0); // okänd indata: stoppa inte arbetet
  }
  const tool = data.tool_name || "";
  const input = data.tool_input || {};
  if (!isTestFile(input.file_path)) process.exit(0);

  const [before, after] = beforeAfter(tool, input);

  if (tool === "Write" && String(before).trim() !== "" && String(after || "").trim() === "") {
    block(`Write tömmer testfilen ${input.file_path}.`);
  }
  if (count(after, SKIP) > count(before, SKIP)) {
    block("Ändringen stänger av eller hoppar över ett test (skip/xit/xtest/xdescribe).");
  }
  const removed = count(before, TESTCASE) - count(after, TESTCASE);
  if (removed > 0) {
    block(`Ändringen tar bort ${removed} test${removed === 1 ? "" : "er"} i ${input.file_path}.`);
  }
  process.exit(0);
});
