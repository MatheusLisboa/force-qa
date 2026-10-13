import { expect, test, type Page } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock";
import { bugs, orgUsers, ROOM_ORG, ROOM_WAR } from "./support/fixtures";

const PIX = bugs[0].title;
const openRoom = async (page: Page) => {
  await page.goto(`/?room=${ROOM_WAR}`);
  await page.getByRole("button", { name: new RegExp(`^${PIX}`) }).waitFor();
};

test.describe("modo leitura com o motivo", () => {
  test("viewer: Novo card desabilitado e aviso explica a permissão", async ({ page }) => {
    await mockSupabase(page, { profile: { role: "viewer", is_superadmin: false } });
    await openRoom(page);

    const button = page.getByRole("button", { name: /Novo card/ });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("title", /Escrever cards/);
    const notice = page.getByTestId("readonly-notice");
    await expect(notice).toContainText("Modo leitura");
    await expect(notice).toContainText("Escrever cards");

    // Sem permissão, Espaço não abre a barra de ações em lote.
    const card = page.getByRole("button", { name: new RegExp(`^${PIX}`) });
    await card.focus();
    await page.keyboard.press("Space");
    await expect(page.getByRole("region", { name: "Ações em lote" })).toHaveCount(0);
  });

  test("membro marcado como somente leitura nesta sala", async ({ page }) => {
    await mockSupabase(page, { memberReadOnly: true, profile: { role: "qa", is_superadmin: false } });
    await openRoom(page);
    await expect(page.getByRole("button", { name: /Novo card/ })).toBeDisabled();
    await expect(page.getByTestId("readonly-notice")).toContainText("somente leitura nesta sala");
  });

  test("quem pode escrever não vê aviso", async ({ page }) => {
    await mockSupabase(page, { profile: { role: "qa", is_superadmin: false } });
    await openRoom(page);
    await expect(page.getByRole("button", { name: /Novo card/ })).toBeEnabled();
    await expect(page.getByTestId("readonly-notice")).toHaveCount(0);
  });

  test("convidado: só lê e comenta quando a sala não liberou escrita", async ({ page }) => {
    await mockSupabase(page, {
      profile: { role: "viewer", is_guest: true, is_superadmin: false, organization_id: null },
      roomOverrides: { guest_permission: "read" },
    });
    await openRoom(page);
    await expect(page.getByRole("button", { name: /Novo card/ })).toBeDisabled();
    await expect(page.getByTestId("readonly-notice")).toContainText("Convidados só leem e comentam");
  });

  test("convidado: sala que liberou escrita permite criar card", async ({ page }) => {
    await mockSupabase(page, {
      profile: { role: "viewer", is_guest: true, is_superadmin: false, organization_id: null },
      roomOverrides: { guest_permission: "write" },
    });
    await openRoom(page);
    await expect(page.getByRole("button", { name: /Novo card/ })).toBeEnabled();
    await expect(page.getByTestId("readonly-notice")).toHaveCount(0);
  });
});

test.describe("acesso à sala (admin)", () => {
  const openAdmin = async (page: Page) => {
    await openRoom(page);
    await page.getByRole("button", { name: "Administrar" }).click();
    await expect(page.getByTestId("room-access")).toBeVisible();
  };

  test("muda a visibilidade e a permissão do convidado", async ({ page }) => {
    const handle = await mockSupabase(page);
    await openAdmin(page);

    await page.getByLabel("Quem pode entrar").selectOption("members");
    await page.getByLabel("O que o convidado pode fazer").selectOption("write");

    await expect.poll(() => handle.writes.filter((w) => w.table === "war_rooms" && w.method === "PATCH").length).toBe(2);
    const bodies = handle.writes.filter((w) => w.table === "war_rooms").map((w) => w.body as Record<string, unknown>);
    expect(bodies.some((b) => b.visibility === "members")).toBe(true);
    expect(bodies.some((b) => b.guest_permission === "write")).toBe(true);
  });

  test("mostra quando o link atual expira", async ({ page }) => {
    await mockSupabase(page);
    await openAdmin(page);
    await expect(page.getByTestId("invite-expiry")).toContainText("expira em");
  });

  test("sala restrita mostra a explicação do que isso significa", async ({ page }) => {
    await mockSupabase(page, { roomOverrides: { visibility: "members" } });
    await openAdmin(page);
    await expect(page.getByTestId("room-access")).toContainText("Só entra quem for adicionado ou convidado");
  });

  test("gera link novo com a validade escolhida (e invalida o anterior)", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const handle = await mockSupabase(page);
    await openAdmin(page);

    await page.getByLabel("Validade do link de convidado").selectOption("1");
    await page.getByRole("button", { name: "Gerar link novo" }).click();

    await expect.poll(() => handle.writes.some((w) => w.table === "room_guest_invites")).toBe(true);
    const upsert = handle.writes.find((w) => w.table === "room_guest_invites")!;
    const body = upsert.body as { expires_at: string | null; token: string };
    expect(body.token).toMatch(/^gst_/);
    const hours = (new Date(body.expires_at as string).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(22);
    expect(hours).toBeLessThan(25);
  });

  test("sem validade grava expires_at nulo de forma explícita", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const handle = await mockSupabase(page);
    await openAdmin(page);
    await page.getByLabel("Validade do link de convidado").selectOption("none");
    await page.getByRole("button", { name: "Gerar link novo" }).click();
    await expect.poll(() => handle.writes.some((w) => w.table === "room_guest_invites")).toBe(true);
    const body = handle.writes.find((w) => w.table === "room_guest_invites")!.body as Record<string, unknown>;
    expect("expires_at" in body).toBe(true);
    expect(body.expires_at).toBeNull();
  });

  test("marca um membro como somente leitura só nesta sala", async ({ page }) => {
    const handle = await mockSupabase(page);
    await openAdmin(page);

    const rafael = orgUsers[1];
    await page.getByRole("button", { name: `Deixar ${rafael.name} somente leitura` }).click();
    await expect.poll(() => handle.writes.some((w) => w.table === "room_members" && w.method === "PATCH")).toBe(true);
    const patch = handle.writes.find((w) => w.table === "room_members" && w.method === "PATCH")!;
    expect(patch.body).toEqual({ read_only: true });
  });

  test("não oferece restringir a si mesmo", async ({ page }) => {
    await mockSupabase(page);
    await openAdmin(page);
    await expect(page.getByRole("button", { name: /Deixar Marina Souza somente leitura/ })).toHaveCount(0);
  });
});

test.describe("nova sala", () => {
  const openCreate = async (page: Page) => {
    await page.goto("/");
    await page.getByText("Sprint 42: Checkout").first().waitFor();
    await page.getByRole("button", { name: "Nova war room" }).click();
    await expect(page.getByLabel("Quem pode entrar")).toBeVisible();
  };

  const fillAndSubmit = async (page: Page) => {
    await page.getByPlaceholder("Ex: WarRoom Release v2.4").fill("Sessão de regressão");
    await page.getByPlaceholder("Ex: App Android Checkout").fill("Loja Online");
    // Área: primeira opção real da lista.
    const squad = page.locator("form select").first();
    await squad.selectOption({ index: 1 });
    await page.getByRole("button", { name: /^Criar/ }).click();
  };

  test("padrão: não manda os campos novos (o banco já nasce visível à organização e convidado só lê)", async ({ page }) => {
    const handle = await mockSupabase(page);
    await openCreate(page);
    await expect(page.getByLabel("Quem pode entrar")).toHaveValue("organization");
    await expect(page.getByLabel("Convidados")).toHaveValue("read");

    await fillAndSubmit(page);
    await expect.poll(() => handle.writes.some((w) => w.table === "war_rooms" && w.method === "POST")).toBe(true);
    const body = handle.writes.find((w) => w.table === "war_rooms" && w.method === "POST")!.body as Record<string, unknown>;
    expect(body.name).toBe("Sessão de regressão");
    expect("visibility" in body).toBe(false);
    expect("guest_permission" in body).toBe(false);
  });

  test("restrita + convidado escreve: os dois valores vão no insert", async ({ page }) => {
    const handle = await mockSupabase(page);
    await openCreate(page);
    await page.getByLabel("Quem pode entrar").selectOption("members");
    await page.getByLabel("Convidados").selectOption("write");

    await fillAndSubmit(page);
    await expect.poll(() => handle.writes.some((w) => w.table === "war_rooms" && w.method === "POST")).toBe(true);
    const body = handle.writes.find((w) => w.table === "war_rooms" && w.method === "POST")!.body as Record<string, unknown>;
    expect(body.visibility).toBe("members");
    expect(body.guest_permission).toBe("write");
  });

  test("escolhas diferentes do padrão aparecem com a explicação", async ({ page }) => {
    await mockSupabase(page);
    await openCreate(page);
    await page.getByLabel("Quem pode entrar").selectOption("members");
    await page.getByLabel("Convidados").selectOption("write");
    await expect(page.getByText("Só entra quem for adicionado ou convidado")).toBeVisible();
    await expect(page.getByText("Convidados também criam e editam cards")).toBeVisible();
  });
});

test.describe("sala visível à organização (quem não é membro lê e comenta)", () => {
  const QA = { role: "qa", is_superadmin: false };

  test("a lista marca como 'Só leitura' as salas que a pessoa só vê, e não as dela", async ({ page }) => {
    await mockSupabase(page, { profile: QA });
    await page.goto("/");
    const open = page.locator(".fq-card-interactive", { hasText: "Design System: Aberto" });
    await expect(open).toBeVisible();
    await expect(open.getByTestId("view-only-badge")).toHaveText("Só leitura");
    // Sala em que ela é membro não leva a marca.
    await expect(page.locator(".fq-card-interactive", { hasText: "Sprint 42: Checkout" }).getByTestId("view-only-badge")).toHaveCount(0);
  });

  test("admin da organização não vê a marca (acessa tudo)", async ({ page }) => {
    await mockSupabase(page);
    await page.goto("/");
    await page.getByText("Design System: Aberto").first().waitFor();
    await expect(page.getByTestId("view-only-badge")).toHaveCount(0);
  });

  test("abrir como não-membro: modo leitura com 'Entrar na sala'; entrar libera a escrita", async ({ page }) => {
    const handle = await mockSupabase(page, { profile: QA });
    await page.goto(`/?room=${ROOM_ORG}`);
    await page.getByRole("heading", { name: "Design System: Aberto" }).waitFor();

    const notice = page.getByTestId("readonly-notice");
    await expect(notice).toContainText("visível a toda a organização");
    await expect(page.getByRole("button", { name: /Novo card/ })).toBeDisabled();

    await page.getByTestId("join-room").click();
    await expect.poll(() => handle.api.some((c) => c.path === "/api/rooms/join" && c.method === "POST")).toBe(true);
    expect(handle.api.find((c) => c.path === "/api/rooms/join")!.body).toEqual({ input: ROOM_ORG });

    // A participação é lida de novo e a escrita é liberada, sem recarregar.
    await expect(page.getByTestId("readonly-notice")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Novo card/ })).toBeEnabled();
  });

  test("admin da organização escreve sem ser membro (sem aviso)", async ({ page }) => {
    await mockSupabase(page);
    await page.goto(`/?room=${ROOM_ORG}`);
    await page.getByRole("heading", { name: "Design System: Aberto" }).waitFor();
    await expect(page.getByTestId("readonly-notice")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Novo card/ })).toBeEnabled();
  });

  test("viewer não-membro: o aviso explica o papel e não oferece 'Entrar' (entrando, não escreveria)", async ({ page }) => {
    await mockSupabase(page, { profile: { role: "viewer", is_superadmin: false } });
    await page.goto(`/?room=${ROOM_ORG}`);
    await page.getByRole("heading", { name: "Design System: Aberto" }).waitFor();
    await expect(page.getByTestId("readonly-notice")).toContainText("Escrever cards");
    await expect(page.getByTestId("join-room")).toHaveCount(0);
  });

  test("as três opções de visibilidade existem ao criar uma sala, e o padrão é 'visível à organização'", async ({ page }) => {
    await mockSupabase(page);
    await page.goto("/");
    await page.getByText("Sprint 42: Checkout").first().waitFor();
    await page.getByRole("button", { name: "Nova war room" }).click();
    const select = page.getByLabel("Quem pode entrar");
    await expect(select).toHaveValue("organization");
    await expect(select.locator("option")).toHaveText(["Visível a toda a organização", "Só por link ou ID", "Somente membros"]);
  });

  test("salas existentes (sem o campo) aparecem como 'só por link', o comportamento de antes", async ({ page }) => {
    await mockSupabase(page);
    await page.goto(`/?room=${ROOM_WAR}`);
    await page.getByRole("button", { name: new RegExp(`^${bugs[0].title}`) }).waitFor();
    await page.getByRole("button", { name: "Administrar" }).click();
    await expect(page.getByLabel("Quem pode entrar")).toHaveValue("link");
  });
});
