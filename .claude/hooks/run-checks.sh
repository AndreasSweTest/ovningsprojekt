#!/usr/bin/env bash
# PostToolUse (Edit|Write|MultiEdit): kodstandarden kontrolleras automatiskt efter varje ändring av en .ts-fil.
# Prettier formaterar filen. ESLint och tsc stoppar (exit 2) med ett meddelande som säger hur felet rättas.

INPUT="$(cat)"

# Claude Code skickar JSON på stdin. CLAUDE_FILE_PATH är en reserv om stdin saknas.
FILE="$(printf '%s' "$INPUT" | node -e '
  let s = "";
  process.stdin.on("data", (c) => (s += c)).on("end", () => {
    try { process.stdout.write(String((JSON.parse(s || "{}").tool_input || {}).file_path || "")); }
    catch { /* okänd indata */ }
  });')"
FILE="${FILE:-${CLAUDE_FILE_PATH:-}}"

case "$FILE" in
  *.ts) ;;
  *) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0

ERRORS=""

# 1. Formatering: rättas automatiskt, stoppar inte.
node node_modules/prettier/bin/prettier.cjs --write "$FILE" >/dev/null 2>&1

# 2. Lint på den ändrade filen.
if ! LINT="$(node node_modules/eslint/bin/eslint.js --no-warn-ignored "$FILE" 2>&1)"; then
  ERRORS+="ESLint hittade fel i $FILE:
$LINT

Så rättar du: regelnamnet står sist på varje rad (till exempel @typescript-eslint/no-explicit-any).
Ändra koden så att regeln följs. Vissa fel rättas automatiskt med: npx eslint --fix \"$FILE\"

"
fi

# 3. Typkontroll av hela projektet, eftersom en ändring kan bryta andra filer.
if ! TSC="$(node node_modules/typescript/bin/tsc --noEmit -p . 2>&1)"; then
  ERRORS+="TypeScript hittade typfel:
$(printf '%s\n' "$TSC" | head -n 20)

Så rättar du: gå till fil(rad,kolumn) ovan och gör typerna kompatibla, till exempel genom att
ändra värdet eller typannoteringen. Kör npm run typecheck för hela listan.
"
fi

if [ -n "$ERRORS" ]; then
  printf 'HOOK BLOCK (run-checks): kodstandarden i docs/standard.md följs inte.\n\n%s' "$ERRORS" >&2
  exit 2
fi
exit 0
