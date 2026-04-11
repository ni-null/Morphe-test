"use strict";

function throwUnsupported(operationName) {
  throw new Error(`Patch provider "stub" does not implement "${operationName}".`);
}

const provider = {
  id: "stub",
  defaultPatchesRepo: "example/stub-patches",

  async resolveCliJar() {
    return throwUnsupported("resolveCliJar");
  },

  async resolvePatchFile() {
    return throwUnsupported("resolvePatchFile");
  },

  async listPatchEntries() {
    return throwUnsupported("listPatchEntries");
  },

  async listCompatibleVersionsRaw() {
    return throwUnsupported("listCompatibleVersionsRaw");
  },

  async listPatchEntriesRaw() {
    return throwUnsupported("listPatchEntriesRaw");
  },

  async resolveVersionCandidates() {
    return throwUnsupported("resolveVersionCandidates");
  },

  resolveCompatibleVersionsFromRaw() {
    return throwUnsupported("resolveCompatibleVersionsFromRaw");
  },

  parsePatchEntries() {
    return throwUnsupported("parsePatchEntries");
  },

  mergePatchEntries() {
    return throwUnsupported("mergePatchEntries");
  },

  async runPatchCommand() {
    return throwUnsupported("runPatchCommand");
  },
};

module.exports = provider;
