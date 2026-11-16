#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const TARGET_DIR_NAMES = new Set(["node_modules", ".next", ".turbo", "dist"]);
const IGNORE_DIR_NAMES = new Set([".git"]);

let removedCount = 0;
let hasErrors = false;

function clean(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return;
    console.error(`[clean] Failed to read ${dir}:`, err.message);
    hasErrors = true;
    return;
  }

  for (const entry of entries) {
    const isDir = entry.isDirectory();
    const isSymlink = entry.isSymbolicLink();

    if (!isDir && !isSymlink) continue;

    const fullPath = path.join(dir, entry.name);

    if (TARGET_DIR_NAMES.has(entry.name)) {
      console.log(`[clean] Removing ${path.relative(rootDir, fullPath) || fullPath}`);
      try {
        fs.rmSync(fullPath, { recursive: true, force: true });
        removedCount++;
      } catch (err) {
        console.error(`[clean] Failed to remove ${fullPath}:`, err.message);
        hasErrors = true;
      }
      continue;
    }

    // Never traverse into symbolic links to avoid escaping the repo or cyclical links
    if (isSymlink) {
      continue;
    }

    if (IGNORE_DIR_NAMES.has(entry.name)) {
      continue;
    }

    clean(fullPath);
  }
}

console.log("[clean] Cleaning build artifacts and dependencies...");
clean(rootDir);

if (hasErrors) {
  console.error("[clean] Cleanup finished with errors.");
  process.exitCode = 1;
} else {
  console.log(`[clean] Finished. Removed ${removedCount} target directories.`);
}
