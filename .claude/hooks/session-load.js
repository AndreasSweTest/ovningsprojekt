#!/usr/bin/env node
// SessionStart: minneskedjans ladda-del. Det som skrivs på stdout blir kontext för agenten.
// Läser den senast ändrade sessionsloggen och lämnar läge, vad som återstår och beslut.
const fs = require("fs");
const path = require("path");

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const dir = path.join(root, "sessions");
const WANTED = [/^l[äa]ge/i, /^vad [åa]terst[åa]r/i, /^beslut/i];
const MAX_LINES = 80;

// En logg räknas bara om den har text utöver rubriker och auto-blocket, så tomma mallar hoppas över.
function hasContent(text) {
  return text
    .replace(/<!-- auto:start -->[\s\S]*?<!-- auto:end -->/g, "")
    .split(/\r?\n/)
    .some((l) => l.trim() !== "" && !/^#/.test(l.trim()));
}

function latestLog() {
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch {
    return null;
  }
  const newestFirst = files
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { f } of newestFirst) {
    if (hasContent(fs.readFileSync(path.join(dir, f), "utf8"))) return f;
  }
  return null;
}

// Plockar ut de "## "-avsnitt vars rubrik matchar WANTED.
function sections(text) {
  const out = [];
  let keep = false;
  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.*)/);
    if (h) keep = WANTED.some((re) => re.test(h[1].trim()));
    if (keep) out.push(line);
  }
  return out.join("\n").trim();
}

const name = latestLog();
if (!name) {
  console.log("Ingen sessionslogg finns i sessions/ än. Skriv en efter arbetspasset (se CLAUDE.md).");
  process.exit(0);
}
const text = fs.readFileSync(path.join(dir, name), "utf8");
const body = (sections(text) || text).split("\n").slice(0, MAX_LINES).join("\n");
console.log(
  `Senaste sessionslogg: sessions/${name}\n` +
    "Fortsätt därifrån. Läs hela filen om du behöver mer.\n\n" +
    body,
);
process.exit(0);
