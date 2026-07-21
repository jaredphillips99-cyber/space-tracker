// zip-project.js
// Run: node zip-project.js

import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_DIR = process.cwd();
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUTPUT_NAME = `space-tracker-${TIMESTAMP}.zip`;
const OUTPUT_PATH = path.join(PROJECT_DIR, OUTPUT_NAME);

const EXCLUDES = [
  "node_modules/*",
  ".git/*",
  "dist/*",
  ".vercel/*",
  "*.DS_Store",
  "*.log",
  ".env",
  "*.zip",       // catches old exports like this one, not just OUTPUT_NAME
];

console.log(`📦 Zipping ${PROJECT_DIR}...`);
console.log(`   Excluding: ${EXCLUDES.join(", ")}\n`);

const excludeArgs = EXCLUDES.map((e) => `"${e}"`).join(" ");
const cmd = `zip -r "${OUTPUT_PATH}" . -x ${excludeArgs}`;

try {
  execSync(cmd, { cwd: PROJECT_DIR, stdio: "inherit" });
  const stats = fs.statSync(OUTPUT_PATH);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`\n✅ Done! → ${OUTPUT_NAME} (${sizeMB} MB)`);
} catch (err) {
  console.error("❌ Zip failed:", err.message);
  process.exit(1);
}