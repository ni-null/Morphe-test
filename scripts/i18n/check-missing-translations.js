"use strict";

const fs = require("fs");
const path = require("path");

function loadGlobalJson() {
  const jsonPath = path.join(__dirname, "..", "..", "desktop", "web", "i18n", "patches", "_global.json");
  const content = fs.readFileSync(jsonPath, "utf8");
  return JSON.parse(content);
}

function extractDescriptionsFromCache(cacheDir) {
  const mainDescs = new Map(); // desc -> patchName
  const optionDescs = new Map(); // desc -> patchName
  const entryDescs = new Map(); // desc -> patchName

  const files = fs.readdirSync(cacheDir).filter((f) => f.endsWith(".json"));

  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(cacheDir, f), "utf8"));

    // Parse entries array (if present)
    const entries = data.entries || [];
    for (const e of entries) {
      if (e.name && e.description) entryDescs.set(e.description, e.name);
    }

    // Parse rawOutput strings
    const raw = data.rawOutput;
    if (!raw) continue;

    for (const key of ["withOptions", "defaults"]) {
      const text = raw[key];
      if (!text) continue;

      const lines = text.split("\n");
      let currentName = "";
      let inOptions = false;

      for (const line of lines) {
        const nameMatch = line.match(/^Name: (.+)$/);
        const descMatch = line.match(/^Description: (.+)$/);
        if (nameMatch) {
          currentName = nameMatch[1];
          inOptions = false;
        }
        if (descMatch && currentName) {
          if (inOptions) {
            optionDescs.set(descMatch[1], currentName);
          } else {
            mainDescs.set(descMatch[1], currentName);
          }
        }
        if (line.startsWith("Options:")) inOptions = true;
      }
    }
  }

  return { mainDescs, optionDescs, entryDescs };
}

function main() {
  const globalJson = loadGlobalJson();
  const patches = globalJson.patches || {};

  // Build set of all descriptions in _global.json
  const globalDescs = new Set();
  for (const [, entry] of Object.entries(patches)) {
    if (entry.descriptions) {
      for (const d of Object.keys(entry.descriptions)) globalDescs.add(d);
    }
  }

  // Find cache directory
  const cacheDirs = [
    "/mnt/c/Users/nin/AppData/Local/MorphePatcher/workspace/cache/patch-entries",
  ];
  let foundCache = "";
  for (const dir of cacheDirs) {
    if (fs.existsSync(dir)) {
      foundCache = dir;
      break;
    }
  }

  if (!foundCache) {
    // Use the provided argument or search
    const arg = process.argv[2];
    if (arg && fs.existsSync(arg)) {
      foundCache = arg;
    } else {
      console.error("Cache directory not found.");
      process.exit(1);
    }
  }

  const { mainDescs, optionDescs, entryDescs } = extractDescriptionsFromCache(foundCache);

  // Check main descriptions
  const missingMain = [];
  for (const [desc, name] of mainDescs) {
    if (!globalDescs.has(desc)) {
      missingMain.push({ name, description: desc });
    }
  }

  // Check entry descriptions
  const missingEntry = [];
  for (const [desc, name] of entryDescs) {
    if (!globalDescs.has(desc)) {
      missingEntry.push({ name, description: desc });
    }
  }

  // Check option descriptions
  const missingOption = [];
  for (const [desc, name] of optionDescs) {
    if (!globalDescs.has(desc)) {
      missingOption.push({ name, description: desc });
    }
  }

  // Report
  console.log("=".repeat(80));
  console.log("Patch Translation Completeness Report");
  console.log("=".repeat(80));
  console.log(`Cache: ${mainDescs.size} main, ${optionDescs.size} option, ${entryDescs.size} entry descriptions`);
  console.log(`_global.json: ${globalDescs.size} descriptions, ${Object.keys(patches).length} patches`);
  console.log();

  const totalMissing = missingMain.length + missingEntry.length + missingOption.length;

  if (missingMain.length > 0) {
    console.log(`❌ Missing main descriptions: ${missingMain.length}`);
    console.log("-".repeat(70));
    for (const m of missingMain) {
      console.log(`  Patch: "${m.name}"`);
      console.log(`  Desc:  "${m.description.substring(0, 100)}${m.description.length > 100 ? "..." : ""}"`);
      console.log();
    }
  } else {
    console.log("✅ All main descriptions are present.");
  }

  if (missingEntry.length > 0) {
    console.log(`\n❌ Missing entry descriptions: ${missingEntry.length}`);
    console.log("-".repeat(70));
    for (const m of missingEntry) {
      console.log(`  Patch: "${m.name}"`);
      console.log(`  Desc:  "${m.description.substring(0, 100)}${m.description.length > 100 ? "..." : ""}"`);
      console.log();
    }
  } else {
    console.log("\n✅ All entry descriptions are present.");
  }

  if (missingOption.length > 0) {
    console.log(`\n❌ Missing option descriptions: ${missingOption.length}`);
    console.log("-".repeat(70));
    for (const m of missingOption) {
      console.log(`  Patch: "${m.name}"`);
      console.log(`  Desc:  "${m.description.substring(0, 100)}${m.description.length > 100 ? "..." : ""}"`);
      console.log();
    }
  } else {
    console.log("\n✅ All option descriptions are present.");
  }

  console.log("\n" + "=".repeat(80));
  console.log(`Total missing: ${totalMissing} (${missingMain.length} main, ${missingEntry.length} entry, ${missingOption.length} option)`);
  if (totalMissing === 0) {
    console.log("🎉 All translations are complete!");
  }
  console.log("=".repeat(80));
}

main();
