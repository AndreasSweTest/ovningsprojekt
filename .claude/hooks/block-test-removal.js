#!/usr/bin/env node
let input = "";
process.stdin.on("data", c => input += c);
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(input || "{}");
    const toolInput = data.tool_input || {};
    const filePath = String(toolInput.file_path || "");
    const content = String(toolInput.content || "");
    const isTest = filePath.includes(".test.") || filePath.includes("/tests/");
    if (isTest && (content.trim() === "" || /test\.skip|xit\s*\(|xdescribe\s*\(/.test(content))) {
      console.error("HOOK BLOCK: Agenten får inte ta bort eller stänga av tester.");
      process.exit(2);
    }
  } catch {}
  process.exit(0);
});
