const { mkdirSync, writeFileSync, rmSync } = require("node:fs");
const { join } = require("node:path");
if (process.argv[2] === "check") {
  rmSync(join(__dirname, ".installed"), { force: true });
  if (Number(process.versions.node.split(".")[0]) < 22) {
    console.error("Morningstar requires Node.js 22+. Update Pinokio's Node.js runtime, then retry Install.");
    process.exitCode = 1;
  }
} else if (process.argv[2] === "finish") {
  mkdirSync(join(__dirname, "workspace"), { recursive: true });
  writeFileSync(join(__dirname, ".installed"), "Built successfully.\n");
} else {
  console.error("Usage: node pinokio/setup.cjs check|finish");
  process.exitCode = 1;
}
