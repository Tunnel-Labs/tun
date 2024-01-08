#!/usr/bin/env -S pnpm exec tsx

import fs from "node:fs";
import downl from "downl";
import applyPatchesExports from "patch-package/dist/applyPatches.js";
import { join } from "desm";
import monorepoPackageJson from "../package.json";
import { generatePatch } from "./utils/patch.js";

await generatePatch();

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

const packageJson = JSON.parse(
  await fs.promises.readFile("build/package.json", "utf8")
);
packageJson.name = "@tunnel/tun";
packageJson.version = monorepoPackageJson.version;

await fs.promises.writeFile(
  "build/package.json",
  JSON.stringify(packageJson, null, 2)
);
