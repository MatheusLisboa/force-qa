import { mkdir } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const entries = [
  "api-src/admin/create-user.ts",
  "api-src/admin/delete-user.ts",
  "api-src/ai/detect-duplicate.ts",
  "api-src/ai/generate-report.ts",
  "api-src/ai/suggest-bug-fields.ts",
  "api-src/guest/validate-room.ts",
  "api-src/rooms/invite.ts",
  "api-src/rooms/join.ts",
];

await Promise.all(
  entries.map(async (entry) => {
    const outfile = "api/" + entry.replace(/^api-src\//, "").replace(/\.ts$/, ".js");
    await mkdir(path.dirname(outfile), { recursive: true });
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
  })
);

console.log(`Bundled ${entries.length} API functions for Vercel.`);
