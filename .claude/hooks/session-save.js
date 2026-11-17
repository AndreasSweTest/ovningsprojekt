#!/usr/bin/env node
// Stop: minneskedjans spara-del. Fyller i dagens sessionslogg med läget ur git, eller skapar en mall.
// Det som skrivs för hand rörs aldrig: bara blocket mellan auto-markeringarna skrivs om.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const dir = path.join(root, "sessions");
const today = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD
const START = "<!-- auto:start -->";
const END = "<!-- auto:end -->";

function git(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function autoBlock() {
  const branch = git(["branch", "--show-current"]);
  if (branch === null) return `${START}\n_Inget git-repo._\n${END}`;
  const head = git(["log", "-1", "--format=%h %s"]) || "–";
  const todays = git(["log", "--since=midnight", "--format=- %h %s"]) || "- inga";
  const dirty =
    (git(["status", "--short"]) || "")
      .split("\n")
      .filter((l) => l && !l.includes("sessions/"))
      .map((l) => `- \`${l.trim()}\``)
      .join("\n") || "- inga";
  const time = new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  return [
    START,
    `_Fylls i automatiskt av .claude/hooks/session-save.js, senast ${time}._`,
    "",
    `- **Branch:** \`${branch}\``,
    `- **Senaste commit:** ${head}`,
    "",
    "**Dagens commits:**",
    todays,
    "",
    "**Ocommittade ändringar:**",
    dirty,
    END,
  ].join("\n");
}

const TEMPLATE = (block) =>
  `# Session ${today}\n\n## Läge\n\n${block}\n\n## Vad fungerade (bevis)\n\n## Vad misslyckades\n\n` +
  "## Vad återstår\n\n## Beslut\n";

function fill(text, block) {
  if (text.includes(START) && text.includes(END)) {
    return text.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block);
  }
  // Lägg blocket direkt under "## Läge", eller först i filen om rubriken saknas.
  const m = text.match(/^## L[äa]ge[^\n]*\n/m);
  if (m) return text.replace(m[0], `${m[0]}\n${block}\n`);
  return `${block}\n\n${text}`;
}

try {
  fs.mkdirSync(dir, { recursive: true });
  const mine = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(today) && f.endsWith(".md") && !/T\d\d-\d\d-\d\d/.test(f))
    .sort();
  const block = autoBlock();
  if (mine.length === 0) {
    fs.writeFileSync(path.join(dir, `${today}.md`), TEMPLATE(block));
  } else {
    const file = path.join(dir, mine[mine.length - 1]);
    const text = fs.readFileSync(file, "utf8");
    const next = fill(text, block);
    if (next !== text) fs.writeFileSync(file, next);
  }
} catch (e) {
  process.stderr.write(`session-save: kunde inte spara läget (${e.message}).\n`);
}
process.exit(0); // stoppa aldrig agenten för att loggen inte gick att skriva
