import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { build } from "esbuild";

const entries = [
  "api/admin/create-user.ts",
  "api/admin/delete-user.ts",
  "api/ai/detect-duplicate.ts",
  "api/ai/generate-report.ts",
  "api/ai/suggest-bug-fields.ts",
  "api/guest/validate-room.ts",
  "api/rooms/invite.ts",
  "api/rooms/join.ts",
];

await Promise.all(
  entries.map(async (entry) => {
    const outfile = entry.replace(/\.ts$/, ".cjs");
    await build({
      entryPoints: [entry],
      bundle: true,
      platform: "node",
      format: "cjs",
      outfile,
      packages: "external",
      logLevel: "warning",
      // Vercel exige a function no module.exports, não em .default
      footer: { js: "module.exports = module.exports.default || module.exports;" },
    });

    const jsSibling = entry.replace(/\.ts$/, ".js");
    if (existsSync(jsSibling)) await unlink(jsSibling);

    // No deploy, só o .cjs pode viver em /api — .ts e .js CJS brigam com "type": "module".
    if (process.env.VERCEL) await unlink(entry);
  })
);

console.log(`Bundled ${entries.length} API functions for Vercel (.cjs).`);
