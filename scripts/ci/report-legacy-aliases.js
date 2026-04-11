"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const DEFAULT_ROOT = path.resolve(__dirname, "..", "..");
const OUTPUT_REL = path.join("docs", "legacy-alias-inventory.md");
const OUTPUT_POSIX = OUTPUT_REL.split(path.sep).join("/");

const IGNORE_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "output",
  "workspace",
  ".qwen",
]);

const PATTERNS = [
  { key: "MORPHE_* (any env-style token)", type: "env", regex: /\bMORPHE_[A-Z0-9_]+\b/gu },
  { key: "\"morphe-cli\"", type: "identifier", regex: /"morphe-cli"/gu },
  { key: "morphe_cli", type: "identifier", regex: /\bmorphe_cli\b/gu },
  { key: "morpheCli", type: "identifier", regex: /\bmorpheCli\b/gu },
];

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  return {
    failOnHits: args.includes("--fail-on-hits"),
    verbose: args.includes("--verbose"),
  };
}

function shouldSkipDir(dirName) {
  return IGNORE_DIRS.has(String(dirName || "").trim());
}

function toPosixRelative(root, target) {
  return path.relative(root, target).split(path.sep).join("/");
}

async function walkFiles(rootDir, currentDir, outFiles) {
  const entries = await fsp.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDir(entry.name)) continue;
      await walkFiles(rootDir, fullPath, outFiles);
      continue;
    }
    if (!entry.isFile()) continue;
    outFiles.push(fullPath);
  }
}

function countMatches(regex, text) {
  regex.lastIndex = 0;
  let count = 0;
  let match = null;
  do {
    match = regex.exec(text);
    if (match) count += 1;
  } while (match);
  return count;
}

function safePreview(line) {
  return String(line || "").trim().replace(/\s+/gu, " ").slice(0, 160);
}

function collectLineHits(regex, text, maxHits = 200) {
  const lines = String(text || "").split(/\r?\n/gu);
  const hits = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    regex.lastIndex = 0;
    if (!regex.test(line)) continue;
    hits.push({ line: index + 1, preview: safePreview(line) });
    if (hits.length >= maxHits) break;
  }
  return hits;
}

async function readTextFile(filePath) {
  const data = await fsp.readFile(filePath);
  if (data.includes(0)) return null;
  return data.toString("utf8");
}

function buildMarkdown(params) {
  const { rootDir, nowIso, patternStats, totalHits } = params;
  const lines = [];
  lines.push("# Legacy Alias Inventory");
  lines.push("");
  lines.push(`Generated at: ${nowIso}`);
  lines.push(`Repo root: \`${rootDir}\``);
  lines.push(`Total hits: **${totalHits}**`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Pattern | Type | Total Matches | Files |");
  lines.push("| --- | --- | ---: | ---: |");
  for (const stat of patternStats) {
    lines.push(`| \`${stat.key}\` | ${stat.type} | ${stat.total} | ${stat.files.length} |`);
  }
  lines.push("");
  lines.push("## Details");
  lines.push("");

  for (const stat of patternStats) {
    lines.push(`### \`${stat.key}\``);
    lines.push("");
    if (stat.total === 0) {
      lines.push("- No matches.");
      lines.push("");
      continue;
    }
    for (const fileInfo of stat.files.slice(0, 200)) {
      lines.push(`- \`${fileInfo.path}\` (${fileInfo.count})`);
      for (const hit of fileInfo.hits.slice(0, 10)) {
        lines.push(`  - L${hit.line}: ${hit.preview}`);
      }
    }
    lines.push("");
  }

  lines.push("## Notes");
  lines.push("");
  lines.push("- This report is for staged cleanup planning; it does not enforce failures by default.");
  lines.push("- Use `node ./scripts/ci/report-legacy-aliases.js --fail-on-hits` to fail CI when any legacy alias remains.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = DEFAULT_ROOT;
  const files = [];
  await walkFiles(rootDir, rootDir, files);

  const patternStats = PATTERNS.map((pattern) => ({
    key: pattern.key,
    type: pattern.type,
    regex: pattern.regex,
    total: 0,
    files: [],
  }));

  for (const filePath of files) {
    const relativePath = toPosixRelative(rootDir, filePath);
    if (relativePath === OUTPUT_POSIX) continue;
    // Skip generated web dist path if present.
    if (relativePath.startsWith("desktop/web/dist/")) continue;

    let text = null;
    try {
      text = await readTextFile(filePath);
    } catch {
      continue;
    }
    if (text == null) continue;

    for (const stat of patternStats) {
      const count = countMatches(stat.regex, text);
      if (count <= 0) continue;
      const hits = collectLineHits(stat.regex, text);
      stat.total += count;
      stat.files.push({
        path: relativePath,
        count,
        hits,
      });
    }
  }

  let totalHits = 0;
  for (const stat of patternStats) {
    totalHits += stat.total;
    stat.files.sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));
  }
  patternStats.sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));

  const markdown = buildMarkdown({
    rootDir: toPosixRelative(rootDir, rootDir) || ".",
    nowIso: new Date().toISOString(),
    patternStats,
    totalHits,
  });
  const outputPath = path.join(rootDir, OUTPUT_REL);
  await fsp.writeFile(outputPath, markdown, "utf8");

  if (args.verbose) {
    console.log(markdown);
  }
  console.log(`Legacy alias report written: ${outputPath}`);
  console.log(`Total hits: ${totalHits}`);

  if (args.failOnHits && totalHits > 0) {
    throw new Error(`Legacy alias hits found: ${totalHits}`);
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
