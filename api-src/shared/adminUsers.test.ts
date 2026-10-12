import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

/** Cliente Supabase mínimo em memória: o bastante para exercitar as regras de adminUsers. */
function makeFakeAdmin(db: Record<string, Row[]>, options: { insertError?: { message: string; code?: string }; createUserError?: { message: string; code?: string } } = {}) {
  const authCalls = { created: [] as Row[], deleted: [] as string[], updated: [] as Array<[string, Row]> };
  let seq = 0;

  const from = (table: string) => {
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row | Row[] | undefined;
    const filters: Array<(row: Row) => boolean> = [];
    const run = (single: boolean) => {
      const rows = (db[table] ||= []);
      const matched = rows.filter((row) => filters.every((f) => f(row)));
      if (op === "select") return { data: single ? matched[0] ?? null : matched, error: null, count: matched.length };
      if (op === "insert") {
        if (options.insertError) return { data: null, error: options.insertError };
        rows.push(...(Array.isArray(payload) ? payload : [payload as Row]));
        return { data: null, error: null };
      }
      if (op === "update") {
        matched.forEach((row) => Object.assign(row, payload));
        return { data: null, error: null };
      }
      db[table] = rows.filter((row) => !matched.includes(row));
      return { data: null, error: null };
    };
    const builder: any = {
      select: () => builder,
      insert: (p: Row | Row[]) => ((op = "insert"), (payload = p), builder),
      update: (p: Row) => ((op = "update"), (payload = p), builder),
      delete: () => ((op = "delete"), builder),
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), builder),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), builder),
      maybeSingle: () => Promise.resolve(run(true)),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(run(false)).then(resolve, reject),
    };
    return builder;
  };

  const admin = {
    from,
    auth: {
      admin: {
        createUser: async (payload: Row) => {
          if (options.createUserError) return { data: { user: null }, error: options.createUserError };
          const id = `auth-${++seq}`;
          authCalls.created.push({ id, ...payload });
          (db["auth_users"] ||= []).push({ id, email: payload.email });
          return { data: { user: { id } }, error: null };
        },
        deleteUser: async (id: string) => (authCalls.deleted.push(id), { error: null }),
        updateUserById: async (id: string, p: Row) => (authCalls.updated.push([id, p]), { error: null }),
        listUsers: async () => ({ data: { users: db["auth_users"] || [] }, error: null }),
      },
    },
  };
  return { admin, authCalls };
}

const state = vi.hoisted(() => ({ admin: null as unknown }));
vi.mock("./auth", async (original) => ({
  ...(await original<typeof import("./auth")>()),
  getSupabaseAdmin: () => state.admin,
}));
vi.mock("./logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { DEFAULT_ORGANIZATION_ID } from "../../src/lib/organizations";
import { adminCreateUser, adminDeleteUser, adminMoveUser } from "./adminUsers";

const ORG_A = "0a0a0a0a-0000-4000-8000-00000000000a";
const ORG_B = "0b0b0b0b-0000-4000-8000-00000000000b";

const baseUser = { name: "Ana", email: "Ana@Acme.dev ", password: "segredo123", role: "qa", squad: "Pagamentos" };

let db: Record<string, Row[]>;
let fake: ReturnType<typeof makeFakeAdmin>;

function setup(options?: Parameters<typeof makeFakeAdmin>[1]) {
  fake = makeFakeAdmin(db, options);
  state.admin = fake.admin;
}

beforeEach(() => {
  db = { users: [], room_members: [], war_rooms: [], organizations: [{ id: ORG_A }, { id: ORG_B }], auth_users: [] };
  setup();
});

describe("adminCreateUser", () => {
  it("exige todos os campos", async () => {
    await expect(adminCreateUser({ ...baseUser, squad: " " })).rejects.toMatchObject({ status: 400 });
    await expect(adminCreateUser({ ...baseUser, password: "" })).rejects.toMatchObject({ status: 400 });
  });

  it("rejeita papel fora da lista (nada de 'superadmin' por esta porta)", async () => {
    await expect(adminCreateUser({ ...baseUser, role: "superadmin" })).rejects.toMatchObject({ status: 400, message: "Papel inválido." });
    expect(fake.authCalls.created).toHaveLength(0);
  });

  it("cria no Auth e grava o perfil na organização pedida, com e-mail normalizado", async () => {
    const id = await adminCreateUser({ ...baseUser, organizationId: ORG_B });
    expect(fake.authCalls.created[0]).toMatchObject({ email: "ana@acme.dev", email_confirm: true });
    expect(db.users).toHaveLength(1);
    expect(db.users[0]).toMatchObject({ id, email: "ana@acme.dev", role: "qa", organization_id: ORG_B, is_guest: false });
  });

  it("sem organização informada usa a padrão", async () => {
    await adminCreateUser(baseUser);
    expect(db.users[0].organization_id).toBe(DEFAULT_ORGANIZATION_ID);
  });

  it("o papel nunca vai para app_metadata (decisão de segurança: só no perfil)", async () => {
    await adminCreateUser({ ...baseUser, role: "admin" });
    expect(fake.authCalls.created[0].app_metadata).toBeUndefined();
  });

  it("e-mail já cadastrado devolve 409 e não cria nada", async () => {
    db.users.push({ id: "u0", email: "ana@acme.dev", organization_id: ORG_A, role: "qa" });
    await expect(adminCreateUser(baseUser)).rejects.toMatchObject({ status: 409 });
    expect(fake.authCalls.created).toHaveLength(0);
  });

  it("não adota perfil de superadmin nem de outra organização com salas", async () => {
    db.users.push({ id: "su", email: "ana@acme.dev", organization_id: DEFAULT_ORGANIZATION_ID, is_superadmin: true });
    await expect(adminCreateUser({ ...baseUser, adoptOrphan: true, organizationId: ORG_A })).rejects.toMatchObject({ status: 409 });

    db.users.length = 0;
    db.users.push({ id: "u1", email: "ana@acme.dev", organization_id: ORG_B, role: "qa" });
    await expect(adminCreateUser({ ...baseUser, adoptOrphan: true, organizationId: ORG_A })).rejects.toMatchObject({ status: 409 });
    expect(fake.authCalls.updated).toHaveLength(0);
  });

  it("adota perfil órfão da org padrão sem salas e redefine a senha", async () => {
    db.users.push({ id: "orf", email: "ana@acme.dev", organization_id: DEFAULT_ORGANIZATION_ID, role: "viewer" });
    const id = await adminCreateUser({ ...baseUser, adoptOrphan: true, organizationId: ORG_A });
    expect(id).toBe("orf");
    expect(fake.authCalls.updated[0][0]).toBe("orf");
    expect(db.users[0]).toMatchObject({ organization_id: ORG_A, role: "qa" });
  });

  it("não adota órfão da org padrão que já está em salas", async () => {
    db.users.push({ id: "orf", email: "ana@acme.dev", organization_id: DEFAULT_ORGANIZATION_ID });
    db.room_members.push({ user_id: "orf", war_room_id: "r1" });
    await expect(adminCreateUser({ ...baseUser, adoptOrphan: true, organizationId: ORG_A })).rejects.toMatchObject({ status: 409 });
  });

  it("falha ao salvar o perfil desfaz a conta no Auth (sem conta fantasma)", async () => {
    setup({ insertError: { message: "boom", code: "23505" } });
    await expect(adminCreateUser(baseUser)).rejects.toMatchObject({ status: 409 });
    expect(fake.authCalls.deleted).toEqual(["auth-1"]);
  });

  it("erro genérico do trigger do Auth vira instrução clara, com status 500", async () => {
    setup({ createUserError: { message: "{}", code: "unexpected_failure" } });
    await expect(adminCreateUser(baseUser)).rejects.toMatchObject({ status: 500, message: expect.stringContaining("public_signup") });
  });
});

describe("adminDeleteUser", () => {
  const actor = { id: "admin-a", organizationId: ORG_A, isSuperadmin: false };
  beforeEach(() => {
    db.users.push(
      { id: "admin-a", organization_id: ORG_A, is_superadmin: false },
      { id: "u-a", organization_id: ORG_A, is_superadmin: false },
      { id: "u-b", organization_id: ORG_B, is_superadmin: false },
      { id: "su", organization_id: DEFAULT_ORGANIZATION_ID, is_superadmin: true }
    );
  });

  it("exige id e proíbe apagar a si mesmo", async () => {
    await expect(adminDeleteUser("", actor)).rejects.toMatchObject({ status: 400 });
    await expect(adminDeleteUser("admin-a", actor)).rejects.toMatchObject({ status: 400 });
  });

  it("404 para usuário inexistente", async () => {
    await expect(adminDeleteUser("nao-existe", actor)).rejects.toMatchObject({ status: 404 });
  });

  it("admin comum não apaga usuário de outra organização", async () => {
    await expect(adminDeleteUser("u-b", actor)).rejects.toMatchObject({ status: 403 });
    expect(fake.authCalls.deleted).toHaveLength(0);
  });

  it("admin comum não apaga o superadmin", async () => {
    await expect(adminDeleteUser("su", actor)).rejects.toMatchObject({ status: 403 });
  });

  it("admin apaga usuário da própria organização", async () => {
    await adminDeleteUser("u-a", actor);
    expect(fake.authCalls.deleted).toEqual(["u-a"]);
  });

  it("superadmin atravessa organizações", async () => {
    await adminDeleteUser("u-b", { id: "su", organizationId: DEFAULT_ORGANIZATION_ID, isSuperadmin: true });
    expect(fake.authCalls.deleted).toEqual(["u-b"]);
  });
});

describe("último admin da organização", () => {
  const actor = { id: "admin-a", organizationId: ORG_A, isSuperadmin: false };

  it("não apaga o único admin da organização (409 com mensagem clara)", async () => {
    db.users.push({ id: "admin-a", name: "Chefe", role: "admin", organization_id: ORG_A }, { id: "u-a", role: "qa", organization_id: ORG_A });
    await expect(adminDeleteUser("admin-a", { ...actor, id: "outro", isSuperadmin: true })).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("último admin"),
    });
    expect(fake.authCalls.deleted).toHaveLength(0);
  });

  it("apaga um admin quando existe outro admin na organização", async () => {
    db.users.push({ id: "admin-a", role: "admin", organization_id: ORG_A }, { id: "admin-b", role: "admin", organization_id: ORG_A });
    await adminDeleteUser("admin-a", { id: "admin-b", organizationId: ORG_A, isSuperadmin: false });
    expect(fake.authCalls.deleted).toEqual(["admin-a"]);
  });

  it("admin de OUTRA organização não conta como 'outro admin'", async () => {
    db.users.push({ id: "admin-a", role: "admin", organization_id: ORG_A }, { id: "admin-x", role: "admin", organization_id: ORG_B });
    await expect(adminDeleteUser("admin-a", { id: "su", organizationId: ORG_A, isSuperadmin: true })).rejects.toMatchObject({ status: 409 });
  });

  it("convidado com papel admin não conta como admin", async () => {
    db.users.push({ id: "admin-a", role: "admin", organization_id: ORG_A }, { id: "g", role: "admin", is_guest: true, organization_id: ORG_A });
    await expect(adminDeleteUser("admin-a", { id: "su", organizationId: ORG_A, isSuperadmin: true })).rejects.toMatchObject({ status: 409 });
  });

  it("devolve nome, papel e organização para a auditoria", async () => {
    db.users.push({ id: "u-a", name: "Ana", role: "qa", organization_id: ORG_A });
    const removed = await adminDeleteUser("u-a", actor);
    expect(removed).toEqual({ name: "Ana", role: "qa", organizationId: ORG_A });
  });

  it("não move o único admin para outra organização", async () => {
    db.users.push({ id: "admin-a", role: "admin", organization_id: ORG_A });
    await expect(adminMoveUser({ isSuperadmin: true, userId: "admin-a", organizationId: ORG_B })).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("último admin"),
    });
    expect(db.users[0].organization_id).toBe(ORG_A);
  });

  it("move admin quando há outro, e informa origem e destino", async () => {
    db.users.push({ id: "admin-a", role: "admin", organization_id: ORG_A }, { id: "admin-b", role: "admin", organization_id: ORG_A });
    const moved = await adminMoveUser({ isSuperadmin: true, userId: "admin-a", organizationId: ORG_B });
    expect(moved).toEqual({ changed: true, from: ORG_A, to: ORG_B });
    expect(db.users[0].organization_id).toBe(ORG_B);
  });

  it("mover para a mesma organização informa changed=false", async () => {
    db.users.push({ id: "u-a", role: "qa", organization_id: ORG_A });
    expect(await adminMoveUser({ isSuperadmin: true, userId: "u-a", organizationId: ORG_A })).toEqual({ changed: false, from: ORG_A, to: ORG_A });
  });
});

describe("adminMoveUser", () => {
  beforeEach(() => {
    db.users.push({ id: "u-a", organization_id: ORG_A });
    db.war_rooms.push({ id: "room-a", organization_id: ORG_A }, { id: "room-b", organization_id: ORG_B });
    db.room_members.push({ user_id: "u-a", war_room_id: "room-a" }, { user_id: "u-a", war_room_id: "room-b" });
  });

  it("só superadmin move usuários entre organizações", async () => {
    await expect(adminMoveUser({ isSuperadmin: false, userId: "u-a", organizationId: ORG_B })).rejects.toMatchObject({ status: 403 });
    expect(db.users[0].organization_id).toBe(ORG_A);
  });

  it("valida usuário e organização de destino", async () => {
    await expect(adminMoveUser({ isSuperadmin: true, userId: " ", organizationId: ORG_B })).rejects.toMatchObject({ status: 400 });
    await expect(adminMoveUser({ isSuperadmin: true, userId: "u-a", organizationId: "ffffffff-0000-4000-8000-000000000000" })).rejects.toMatchObject({ status: 404 });
    await expect(adminMoveUser({ isSuperadmin: true, userId: "fantasma", organizationId: ORG_B })).rejects.toMatchObject({ status: 404 });
  });

  it("mover para a mesma organização não faz nada", async () => {
    await adminMoveUser({ isSuperadmin: true, userId: "u-a", organizationId: ORG_A });
    expect(db.room_members).toHaveLength(2);
  });

  it("move e REMOVE o acesso às salas da organização anterior (nada vaza para o novo tenant)", async () => {
    await adminMoveUser({ isSuperadmin: true, userId: "u-a", organizationId: ORG_B });
    expect(db.users[0].organization_id).toBe(ORG_B);
    // room-a (org A, a antiga) sai; room-b (já da org B) permanece.
    expect(db.room_members).toEqual([{ user_id: "u-a", war_room_id: "room-b" }]);
  });
});
