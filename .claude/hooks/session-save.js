#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const dir = path.join(process.cwd(), "sessions");
if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true});
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const file = path.join(dir, stamp + ".md");
fs.writeFileSync(file, "# Session " + stamp + "\n\n## Lage\n\n## Vad fungerade (bevis)\n\n## Vad misslyckades\n\n## Vad aterstar\n\n## Beslut\n");
console.log("Sessionslogg skapad:", file);
