#!/usr/bin/env -S pnpm exec tsx

import { generatePatch } from "./utils/patch.js";

await generatePatch();
