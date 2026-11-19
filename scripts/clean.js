const fs = require("fs");
const path = require("path");

const TARGET_DIR_NAMES = new Set(["node_modules", ".next", ".turbo", "dist"]);
const IGNORED_DIRS = new Set([".git"]);

const rootDir = path.resolve(__dirname, "..");

let deletedCount = 0;

function cleanDirs(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const dirName = entry.name;
    const fullPath = path.join(dir, dirName);

    if (IGNORED_DIRS.has(dirName)) {
      continue;
    }

    if (TARGET_DIR_NAMES.has(dirName)) {
      try {
        console.log(`Removing ${path.relative(rootDir, fullPath)}...`);
        fs.rmSync(fullPath, { recursive: true, force: true });
        deletedCount++;
      } catch (err) {
        console.error(`Failed to remove ${fullPath}: ${err.message}`);
      }
      continue;
    }

    cleanDirs(fullPath);
  }
}

console.log("Cleaning build artifacts and dependencies across workspace...");
cleanDirs(rootDir);
console.log(`Clean complete. Removed ${deletedCount} target directories.`);
