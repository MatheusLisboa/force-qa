import { envVar } from "./auth";

const PRODUCTION_APP = "https://force-qa.vercel.app";

/** Invite magic-link target. Never trust Origin. */
export function appRedirectTo(): string {
  const fromEnv = envVar("APP_URL");
  if (fromEnv) return `${fromEnv.replace(/\/$/, "")}/`;

  const vercelUrl = envVar("VERCEL_URL");
  if (vercelUrl && !/localhost/i.test(vercelUrl)) {
    const host = vercelUrl.replace(/^https?:\/\//, "");
    return `https://${host}/`;
  }

  if (process.env.NODE_ENV !== "production") {
    const port = envVar("PORT") || "3000";
    return `http://localhost:${port}/`;
  }

  return `${PRODUCTION_APP}/`;
}
