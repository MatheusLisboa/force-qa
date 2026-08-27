import { existsSync } from "node:fs";
import { rm, unlink } from "node:fs/promises";
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
      footer: { js: "module.exports = module.exports.default || module.exports;" },
    });

    const jsSibling = entry.replace(/\.ts$/, ".js");
    if (existsSync(jsSibling)) await unlink(jsSibling);
  })
);

// No deploy a Vercel trata qualquer .ts/.js em /api como function.
// Ficam só os .cjs (CommonJS explícito), que não brigam com "type": "module".
if (process.env.VERCEL) {
  await Promise.all(entries.map((entry) => unlink(entry)));
  await rm("api/shared", { recursive: true, force: true });
}

console.log(`Bundled ${entries.length} API functions for Vercel (.cjs).`);
