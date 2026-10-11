import type { Page, Route } from "@playwright/test";
import { bugs, comments, notifications, orgUsers, projects, rooms, userRow, USER_ID } from "./fixtures";

const ORIGIN = "https://e2e.supabase.test";
export const STORAGE_KEY = "sb-e2e-auth-token";

const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

function fakeJwt() {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: USER_ID, role: "authenticated", exp })}.signature`;
}

export function authUser() {
  return {
    id: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "marina@acme.dev",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
}

export function sessionPayload() {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
  return {
    access_token: fakeJwt(),
    refresh_token: "mock-refresh",
    token_type: "bearer",
    expires_in: 86_400,
    expires_at: exp,
    user: authUser(),
  };
}

export interface MockOptions {
  /** Começa autenticado (padrão) ou na tela de login. */
  signedIn?: boolean;
  profile?: Record<string, unknown>;
  /** Fazer as mutações (PATCH/POST) falharem com 400. */
  failWrites?: boolean;
}

export interface MockHandle {
  /** Requisições de escrita feitas ao REST, na ordem. */
  writes: Array<{ method: string; table: string; body: unknown }>;
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });

function tableRows(table: string, profile: Record<string, unknown>): unknown[] {
  switch (table) {
    case "users":
      return [profile, ...orgUsers.slice(1)];
    case "war_rooms":
      return rooms;
    case "bugs":
      return bugs;
    case "notifications":
      return notifications;
    case "projects":
      return projects;
    case "bug_comments":
      return comments;
    default:
      return [];
  }
}

/** Simula Auth, REST e Realtime do Supabase para o app rodar sem backend. */
export async function mockSupabase(page: Page, options: MockOptions = {}): Promise<MockHandle> {
  const { signedIn = true, failWrites = false } = options;
  const profile = userRow(options.profile);
  const handle: MockHandle = { writes: [], };

  if (signedIn) {
    await page.addInitScript(
      ([key, value]) => {
        try {
          localStorage.setItem(key as string, value as string);
        } catch {
          /* ignore */
        }
      },
      [STORAGE_KEY, JSON.stringify(sessionPayload())]
    );
  }

  await page.route(`${ORIGIN}/auth/v1/**`, async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "OPTIONS") return json(route, {});
    if (url.pathname.endsWith("/user")) return json(route, authUser());
    if (url.pathname.endsWith("/token")) return json(route, sessionPayload());
    if (url.pathname.endsWith("/logout")) return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    return json(route, {});
  });

  await page.route(`${ORIGIN}/rest/v1/**`, async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const table = url.pathname.split("/").pop() || "";

    if (method === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
        },
      });
    }

    if (method === "GET" || method === "HEAD") {
      let rows = tableRows(table, profile);
      const eqId = url.searchParams.get("id");
      if (eqId?.startsWith("eq.")) rows = rows.filter((row) => (row as { id?: string }).id === eqId.slice(3));
      const wantsObject = (request.headers()["accept"] || "").includes("vnd.pgrst.object");
      if (wantsObject) {
        return rows.length
          ? json(route, rows[0])
          : json(route, { code: "PGRST116", message: "The result contains 0 rows", details: null, hint: null }, 406);
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*", "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` },
        body: JSON.stringify(rows),
      });
    }

    let body: unknown = null;
    try {
      body = request.postDataJSON();
    } catch {
      /* corpo vazio */
    }
    handle.writes.push({ method, table, body });
    if (failWrites) return json(route, { code: "42501", message: "permission denied", details: null, hint: null }, 403);
    return route.fulfill({
      status: method === "POST" ? 201 : 204,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: method === "POST" ? JSON.stringify(Array.isArray(body) ? body : [body ?? {}]) : "",
    });
  });

  // Storage e demais chamadas: nada a assinar.
  await page.route(`${ORIGIN}/storage/v1/**`, (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    }
    // Upload: aceita e registra. Qualquer outra coisa (assinatura de URL) não existe no mock.
    const pathname = new URL(request.url()).pathname;
    // Imagem pública (print colado num comentário): devolve um SVG ilustrativo.
    if (request.method() === "GET" && pathname.includes("/object/public/evidence/")) {
      return route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        headers: { "access-control-allow-origin": "*" },
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="160" viewBox="0 0 360 160"><rect width="360" height="160" rx="8" fill="#1f2937"/><rect x="12" y="12" width="336" height="22" rx="4" fill="#374151"/><circle cx="26" cy="23" r="4" fill="#ef4444"/><circle cx="40" cy="23" r="4" fill="#f59e0b"/><circle cx="54" cy="23" r="4" fill="#10b981"/><rect x="24" y="56" width="200" height="12" rx="3" fill="#6b7280"/><rect x="24" y="80" width="260" height="12" rx="3" fill="#4b5563"/><rect x="24" y="112" width="120" height="26" rx="5" fill="#ef4444"/><text x="40" y="129" font-family="sans-serif" font-size="12" fill="#fff">504 Gateway</text></svg>`,
      });
    }
    if (pathname.includes("/object/sign/")) return json(route, { error: "not found" }, 404);
    if (request.method() === "POST" || request.method() === "PUT") {
      handle.writes.push({ method: request.method(), table: "storage:" + pathname, body: null });
      return json(route, { Key: "evidence/ok", Id: "mock" });
    }
    return json(route, { error: "not found" }, 404);
  });
  await page.route("**/api/**", (route) => json(route, { error: "mock" }, 404));

  // Realtime (Phoenix channels v2): aceita joins e devolve "ok" com os bindings.
  await page.routeWebSocket(/e2e\.supabase\.test\/realtime\/v1\/websocket/, (ws) => {
    ws.onMessage((raw) => {
      if (typeof raw !== "string") return;
      let frame: unknown;
      try {
        frame = JSON.parse(raw);
      } catch {
        return;
      }
      if (!Array.isArray(frame)) return;
      const [joinRef, ref, topic, event, payload] = frame as [string | null, string, string, string, Record<string, any>];
      if (event === "heartbeat") {
        ws.send(JSON.stringify([null, ref, "phoenix", "phx_reply", { status: "ok", response: {} }]));
        return;
      }
      if (event === "phx_join") {
        const bindings = (payload?.config?.postgres_changes ?? []) as Array<Record<string, unknown>>;
        ws.send(
          JSON.stringify([
            joinRef,
            ref,
            topic,
            "phx_reply",
            { status: "ok", response: { postgres_changes: bindings.map((b, i) => ({ ...b, id: i + 1 })) } },
          ])
        );
        return;
      }
      if (event === "phx_leave") {
        ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response: {} }]));
      }
    });
  });

  return handle;
}
