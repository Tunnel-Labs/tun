#!/usr/bin/env -S pnpm exec tsx

import fs from "node:fs";
import downl from "downl";
import applyPatchesExports from "patch-package/dist/applyPatches.js";
import { join } from "desm";

const { applyPatch } = applyPatchesExports;

fs.rmSync("build", { force: true, recursive: true });

const version = "4.7.0";
await downl(`https://registry.npmjs.org/tsx/-/tsx-${version}.tgz`, "build", {
  extract: { strip: 1 },
});

applyPatch({
  patchFilePath: join(import.meta.url, "../generated/tsx@4.7.0.patch"),
  cwd: "build",
});
