import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

// Overwrites api/**/*.js. Tiny stubs stay in git so Vercel's functions glob
// matches before build. Do not commit the generated bundles.
// Hobby plan: max 12 serverless functions. Keep this list ≤ 12 outfiles.

const HOBBY_FUNCTION_LIMIT = 12;

const entries = [
  { entry: "api-src/admin/create-user.ts", outfile: "api/admin/create-user.js" },
  { entry: "api-src/admin/create-organization.ts", outfile: "api/admin/create-organization.js" },
  { entry: "api-src/admin/delete-user.ts", outfile: "api/admin/delete-user.js" },
  { entry: "api-src/admin/move-user.ts", outfile: "api/admin/move-user.js" },
  { entry: "api-src/admin/org-webhook.ts", outfile: "api/admin/org-webhook.js" },
  { entry: "api-src/ai/router.ts", outfile: "api/ai/[...path].js" },
  { entry: "api-src/guest/validate-room.ts", outfile: "api/guest/validate-room.js" },
  { entry: "api-src/rooms/invite.ts", outfile: "api/rooms/invite.js" },
  { entry: "api-src/rooms/join.ts", outfile: "api/rooms/join.js" },
  { entry: "api-src/webhooks/dispatch.ts", outfile: "api/webhooks/dispatch.js" },
  { entry: "api-src/export/router.ts", outfile: "api/export/[...path].js" },
];

const stale = [
  "api/admin/org-export-token.js",
  "api/ai/detect-duplicate.js",
  "api/ai/generate-report.js",
  "api/ai/suggest-bug-fields.js",
  "api/export/cards.js",
  "api/export/rooms.js",
];

if (entries.length > HOBBY_FUNCTION_LIMIT) {
  throw new Error(
    `Vercel Hobby permite ${HOBBY_FUNCTION_LIMIT} funções; o bundle tem ${entries.length}.`
  );
}

await Promise.all(stale.map((file) => unlink(file).catch(() => undefined)));

await Promise.all(
  entries.map(async ({ entry, outfile }) => {
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
