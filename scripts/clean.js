const fs = require("node:fs");
const path = require("node:path");
const process = require("node:process");

const targets = new Set(["node_modules", ".next", ".turbo", "dist"]);

function clean(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (targets.has(entry.name)) {
      try {
        fs.rmSync(full, { recursive: true, force: true });
        console.log("removed", full);
      } catch (err) {
        console.error("failed to remove", full, err.message);
      }
      continue;
    }
    clean(full);
  }
}

clean(process.cwd());
console.log("clean done");
