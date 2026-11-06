# Order API – Claude Code Rigg

## Projekt
REST-API för kunder och beställningar (TypeScript + Express + PostgreSQL).
Äldre, odokumenterad prisberäkningsmodul: src/legacy/price_calc.py.

## Arbetssätt (måste följas)
1. Research → skriv docs/research-<story>.md
2. Plan → skriv docs/plan-<story>.md (använd /plan)
3. Bygg med TDD (/tdd) – tester först
4. Granska (/review)
5. Commit med tydligt meddelande
6. Sessionslogg i sessions/ efter varje arbetspass

## Regler
- Agenten får aldrig ta bort eller stänga av tester. En hook stoppar det.
- Inga kunddata eller produktionsdata i kod eller loggar.
- All SQL parametriserad.
- Använd alltid /tdd när du skriver ny funktion.
