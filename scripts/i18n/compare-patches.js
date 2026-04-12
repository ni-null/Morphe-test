"use strict";

const fs = require("fs");
const path = require("path");

// ========== Step 1: Parse aa.txt ==========
function parseMppList(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split("\n");

  const patches = []; // { name, description }
  let currentName = "";
  let currentDesc = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("Name: ")) {
      // Save previous patch
      if (currentName && currentDesc) {
        patches.push({ name: currentName, description: currentDesc });
      }
      currentName = trimmed.substring("Name: ".length);
      currentDesc = "";
    } else if (trimmed.startsWith("Description: ")) {
      currentDesc = trimmed.substring("Description: ".length);
    }
  }
  // Save last patch
  if (currentName && currentDesc) {
    patches.push({ name: currentName, description: currentDesc });
  }

  return patches;
}

// ========== Step 2: Load _global.json ==========
function loadGlobalJson() {
  const jsonPath = path.join(
    __dirname,
    "..",
    "..",
    "desktop",
    "web",
    "i18n",
    "patches",
    "_global.json",
  );
  return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
}

// ========== Step 3: Load source translation maps ==========
function extractMapFromScript(scriptContent, mapName) {
  const startRegex = new RegExp(`const\\s+${mapName}\\s*=\\s*\\{`);
  const startMatch = scriptContent.match(startRegex);
  if (!startMatch) return null;

  const startIndex = startMatch.index + startMatch[0].length - 1;
  let depth = 0,
    inString = false,
    escapeNext = false;

  for (let i = startIndex; i < scriptContent.length; i++) {
    const ch = scriptContent[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (ch === "\\") {
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        let mapStr = scriptContent.substring(startIndex, i + 1);
        mapStr = mapStr.replace(/,\s*([}\]])/g, "$1");
        mapStr = mapStr.replace(
          /(?<=\{|\n)\s*([A-Za-z_]\w*)\s*:/g,
          ' "$1":',
        );
        try {
          return JSON.parse(mapStr);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function loadSourceMaps() {
  const scriptPath = path.join(__dirname, "sync-patch-translations.js");
  const content = fs.readFileSync(scriptPath, "utf8");
  const nameMap = extractMapFromScript(content, "ZH_TW_NAME_MAP");
  const descriptionMap = extractMapFromScript(content, "ZH_TW_DESCRIPTION_MAP");
  if (!nameMap || !descriptionMap) {
    console.error("Failed to extract source maps.");
    process.exit(1);
  }
  return { nameMap, descriptionMap };
}

// ========== Main ==========
function main() {
  const aaPath = process.argv[2];
  if (!aaPath || !fs.existsSync(aaPath)) {
    console.error("Usage: node compare-patches.js <path/to/aa.txt>");
    process.exit(1);
  }

  const mppPatches = parseMppList(aaPath);
  const globalJson = loadGlobalJson();
  const { nameMap, descriptionMap } = loadSourceMaps();

  // Build sets from _global.json
  const existingPatches = globalJson.patches || {};
  const existingPatchNames = new Set();
  for (const [key, entry] of Object.entries(existingPatches)) {
    if (entry.name?.en) existingPatchNames.add(entry.name.en);
  }
  const existingDescriptions = new Set();
  for (const [, entry] of Object.entries(existingPatches)) {
    if (entry.descriptions) {
      for (const d of Object.keys(entry.descriptions)) existingDescriptions.add(d);
    }
  }

  // ========== Analysis ==========
  const newPatches = []; // patches in MPP but not in _global.json
  const newDescriptions = []; // descriptions in MPP but not in _global.json
  const missingZhTw = []; // patches/descs in _global.json but zh-TW equals en

  // Check patches from MPP
  for (const p of mppPatches) {
    const key = p.name.toLowerCase();

    // Check if patch exists
    if (!existingPatches[key]) {
      newPatches.push(p);
    } else {
      // Check if patch name has zh-TW
      const entry = existingPatches[key];
      if (!entry.name?.["zh-TW"] || entry.name["zh-TW"] === entry.name.en) {
        missingZhTw.push({
          type: "name",
          nameEn: p.name,
          expectedZh: nameMap[p.name] || p.name,
          currentZh: entry.name?.["zh-TW"] || "(missing)",
        });
      }
    }

    // Check description
    if (!existingDescriptions.has(p.description)) {
      newDescriptions.push({
        name: p.name,
        description: p.description,
        expectedZh: descriptionMap[p.description] || "",
      });
    }
  }

  // Also check for descriptions in source map that aren't in _global.json
  for (const [descEn, descZh] of Object.entries(descriptionMap)) {
    if (!existingDescriptions.has(descEn)) {
      // Check if it's already captured as a new description
      const alreadyCaptured = newDescriptions.some((n) => n.description === descEn);
      if (!alreadyCaptured) {
        newDescriptions.push({
          name: "(from source map)",
          description: descEn,
          expectedZh: descZh,
        });
      }
    }
  }

  // ========== Report ==========
  console.log("=".repeat(80));
  console.log("patches-1.24.0-dev.4.mpp Patch Translation Gap Report");
  console.log("=".repeat(80));
  console.log(`MPP patches: ${mppPatches.length}`);
  console.log(`Unique patch names in MPP: ${new Set(mppPatches.map((p) => p.name.toLowerCase())).size}`);
  console.log(`_global.json patches: ${Object.keys(existingPatches).length}`);
  console.log();

  // New patches
  if (newPatches.length > 0) {
    const uniqueNew = [...new Set(newPatches.map((p) => p.name.toLowerCase()))];
    console.log(`🆕 New patches (not in _global.json): ${uniqueNew.length}`);
    console.log("-".repeat(70));
    for (const name of uniqueNew) {
      const found = newPatches.find((p) => p.name.toLowerCase() === name);
      console.log(`  "${found.name}"`);
    }
    console.log();
  } else {
    console.log("✅ No new patches.");
  }

  // New descriptions
  if (newDescriptions.length > 0) {
    console.log(`🆕 New descriptions (not in _global.json): ${newDescriptions.length}`);
    console.log("-".repeat(70));
    for (const d of newDescriptions) {
      console.log(`  Patch: "${d.name}"`);
      console.log(`  En:    "${d.description.substring(0, 90)}${d.description.length > 90 ? "..." : ""}"`);
      console.log(`  zh-TW: "${d.expectedZh || "(needs manual translation)"}"`);
      console.log();
    }
  } else {
    console.log("✅ No new descriptions.");
  }

  // Missing zh-TW translations
  if (missingZhTw.length > 0) {
    console.log(`⚠️  Existing entries with missing/untranslated zh-TW: ${missingZhTw.length}`);
    console.log("-".repeat(70));
    for (const m of missingZhTw) {
      console.log(`  "${m.nameEn}"`);
      console.log(`    Expected: "${m.expectedZh}"`);
      console.log(`    Current:  "${m.currentZh}"`);
      console.log();
    }
  } else {
    console.log("✅ All existing zh-TW translations are in place.");
  }

  // ========== Output merge script ==========
  console.log("=".repeat(80));
  console.log(`Summary: ${newPatches.length} new patch entries, ${newDescriptions.length} new descriptions, ${missingZhTw.length} missing zh-TW`);
  console.log("=".repeat(80));

  // Generate merge data
  const mergeData = {
    newPatches: newPatches.map((p) => ({
      key: p.name.toLowerCase(),
      name: { en: p.name, "zh-TW": nameMap[p.name] || p.name },
    })),
    newDescriptions: newDescriptions.map((d) => ({
      patchKey: d.name.toLowerCase(),
      description: {
        en: d.description,
        "zh-TW": d.expectedZh || d.description,
      },
    })),
  };

  const reportPath = path.join(__dirname, "merge-report-1.24.0-dev.4.json");
  fs.writeFileSync(reportPath, JSON.stringify(mergeData, null, 2) + "\n", "utf8");
  console.log(`\nMerge data → ${reportPath}`);
}

main();
