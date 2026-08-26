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
  entries.map((entry) =>
    build({
      entryPoints: [entry],
      bundle: true,
      platform: "node",
      format: "cjs",
      outfile: entry.replace(/\.ts$/, ".js"),
      packages: "external",
      logLevel: "warning",
    })
  )
);

console.log(`Bundled ${entries.length} API functions for Vercel.`);
