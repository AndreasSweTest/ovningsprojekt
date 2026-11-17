#!/usr/bin/env node
// PreToolUse (Bash|PowerShell och Edit|Write|MultiEdit): stoppar farliga kommandon och skrivning till .env.
// Kompletterar deny-reglerna i .claude/settings.json med ett meddelande som säger vad som ska göras i stället.
const path = require("path");

const COMMANDS = [
  [/\bgit\s+push\b[^\n]*(\s--force(?!-with-lease)\b|\s-f\b|\s\+\S)/, "force-push skriver över andras historik. Pusha utan --force, eller fråga användaren."],
  [/\bgit\s+reset\s+[^\n]*--hard\b/, "git reset --hard kastar ocommittat arbete. Använd git stash eller git restore <fil>."],
  [/\bgit\s+(commit|push|merge)\b[^\n]*--no-verify\b/, "--no-verify hoppar över kontrollerna. Rätta felet som kontrollen visar i stället."],
  [/\brm\s+(-\w*r\w*f|-\w*f\w*r|-r\s+-f|-f\s+-r)\b/, "rm -rf går inte att ångra. Ta bort enskilda filer, eller fråga användaren."],
  [/\bgit\s+clean\s+[^\n]*-\w*f/, "git clean -f raderar ospårade filer för gott. Lista dem med git clean -n och fråga användaren."],
  [/(>>?|\b(cp|mv|tee|sed\s+-i)\b[^\n]*)\s*\S*(^|[\s/\\])\.env(\.(?!example\b)[\w.-]+)?(\s|$)/, "Skrivning till .env är stoppad: den kan innehålla hemligheter. Ändra .env.example och be användaren uppdatera .env."],
];

function isEnvFile(filePath) {
  const base = path.basename(String(filePath || ""));
  return /^\.env(\..+)?$/.test(base) && base !== ".env.example";
}

function block(message) {
  process.stderr.write(`HOOK BLOCK (guard): ${message}\n`);
  process.exit(2);
}

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let data;
  try {
    data = JSON.parse(raw || "{}");
  } catch {
    process.exit(0);
  }
  const tool = data.tool_name || "";
  const input = data.tool_input || {};

  if (tool === "Bash" || tool === "PowerShell") {
    const command = String(input.command || "");
    for (const [re, message] of COMMANDS) {
      if (re.test(command)) block(message);
    }
  } else if (isEnvFile(input.file_path)) {
    block(
      `${path.basename(input.file_path)} kan innehålla hemligheter och skrivs inte av agenten. ` +
        "Lägg nya variabler i .env.example och be användaren uppdatera .env.",
    );
  }
  process.exit(0);
});
