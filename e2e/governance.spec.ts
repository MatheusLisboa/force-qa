import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock";
import { ROOM_WAR } from "./support/fixtures";

test.describe("usuários: último admin", () => {
  test("avisa que só há um admin e impede excluí-lo", async ({ page }) => {
    await mockSupabase(page);
    await page.goto("/admin/users");

    await expect(page.getByTestId("single-admin-warning")).toContainText("Só Marina Souza é admin desta organização");
    const remove = page.getByRole("button", { name: /Excluir Marina Souza \(indisponível: último admin\)/ });
    await expect(remove).toBeDisabled();
    await expect(remove).toHaveAttribute("title", /promova outro admin/);

    // Quem não é o último admin continua podendo ser excluído.
    await expect(page.getByRole("button", { name: "Excluir Rafael Lima" })).toBeEnabled();
  });
});

test.describe("permissões", () => {
  test("mostra o que muda antes de salvar e permite descartar", async ({ page }) => {
    await mockSupabase(page);
    await page.goto("/admin/permissions");
    await page.getByRole("heading", { name: "Permissões" }).waitFor();

    await expect(page.getByTestId("pending-changes")).toHaveCount(0);
    await page.getByRole("checkbox", { name: "Escrever cards para Viewer" }).check();

    const pending = page.getByTestId("pending-changes");
    await expect(pending).toContainText("1 alteração ainda não salva");
    await expect(pending).toContainText("Viewer passa a poder: Escrever cards");
    await expect(page.getByRole("button", { name: "Salvar (1)" })).toBeEnabled();

    await page.getByRole("button", { name: "Descartar" }).click();
    await expect(pending).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "Escrever cards para Viewer" })).not.toBeChecked();
  });

  test("a coluna Admin é travada", async ({ page }) => {
    await mockSupabase(page);
    await page.goto("/admin/permissions");
    await page.getByRole("heading", { name: "Permissões" }).waitFor();
    for (const label of ["Escrever cards para Admin", "Usuários para Admin", "Integrações para Admin"]) {
      const box = page.getByRole("checkbox", { name: label });
      await expect(box).toBeDisabled();
      await expect(box).toBeChecked();
    }
  });

  test("avisa quando papéis têm exatamente as mesmas permissões e resume cada papel", async ({ page }) => {
    await mockSupabase(page);
    await page.goto("/admin/permissions");
    await page.getByRole("heading", { name: "Permissões" }).waitFor();

    const note = page.getByTestId("equivalent-roles");
    await expect(note).toContainText("QA = Scrum");
    await expect(note).toContainText("Dev = DBA = DevOps");

    await expect(page.getByTestId("role-summary-viewer")).toContainText("apenas ler e comentar");
    await expect(page.getByTestId("role-summary-developer")).toContainText("Escrever cards, Atribuir cards, Usar IA");
  });

  test("diferenciar um papel desfaz o aviso de equivalência desse papel", async ({ page }) => {
    await mockSupabase(page);
    await page.goto("/admin/permissions");
    await page.getByRole("heading", { name: "Permissões" }).waitFor();
    await page.getByRole("checkbox", { name: "Visões para DBA" }).check();
    await expect(page.getByTestId("equivalent-roles")).toContainText("Dev = DevOps");
    await expect(page.getByTestId("equivalent-roles")).not.toContainText("DBA");
  });
});

test.describe("auditoria", () => {
  test("lista os eventos em português, filtra e busca", async ({ page }) => {
    await mockSupabase(page);
    await page.goto("/admin/audit");
    const list = page.getByTestId("audit-list");
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await expect(list).toContainText("Marina Souza mudou a visibilidade da sala Sprint 42: Checkout: Toda a organização → Somente membros.");
    await expect(list).toContainText("Marina Souza mudou o papel de Rafael Lima: Dev → QA.");
    await expect(list).toContainText("gerou um token de extração (2 sala(s))");

    await page.getByRole("button", { name: "Pessoas" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list).toContainText("papel de Rafael Lima");

    await page.getByRole("button", { name: "Tudo" }).click();
    await page.getByLabel("Buscar na auditoria").fill("token");
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await page.getByLabel("Buscar na auditoria").fill("não existe");
    await expect(page.getByText("Nada com esses filtros")).toBeVisible();
  });

  test("nunca mostra segredos", async ({ page }) => {
    await mockSupabase(page);
    await page.goto("/admin/audit");
    await page.getByTestId("audit-list").waitFor();
    const text = await page.getByTestId("audit-list").innerText();
    expect(text).not.toMatch(/gst_|fqex_|token:|Bearer/i);
  });

  test("só admin enxerga a entrada e a página", async ({ page }) => {
    await mockSupabase(page, { profile: { role: "qa", is_superadmin: false } });
    await page.goto("/admin/audit");
    // Sem permissão, a rota cai no painel (a página de auditoria não renderiza).
    await expect(page.getByTestId("audit-list")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Auditoria" })).toHaveCount(0);
  });

  test("a paleta de comandos oferece Auditoria para admin", async ({ page }) => {
    await mockSupabase(page);
    await page.goto("/");
    await page.getByText("Sprint 42: Checkout").first().waitFor();
    await page.keyboard.press("Control+k");
    await page.keyboard.type("audit");
    await expect(page.getByRole("dialog", { name: "Paleta de comandos" }).getByRole("option", { name: /Auditoria/ })).toBeVisible();
  });
});

test.describe("token de extração", () => {
  test("admin escolhe as salas e o POST leva só elas", async ({ page }) => {
    const handle = await mockSupabase(page, { profile: { role: "admin", is_superadmin: false } });
    await page.goto("/admin/integrations");
    const scope = page.getByTestId("export-scope");
    await scope.waitFor();

    await scope.getByLabel("Somente as salas escolhidas").check();
    await expect(scope).toContainText("Sem nenhuma sala marcada, o token não enxerga nada");
    await scope.getByLabel("Sprint 42: Checkout").check();
    await expect(scope).not.toContainText("Sem nenhuma sala marcada");

    await page.getByRole("button", { name: "Gerar token" }).click();
    await page.getByRole("button", { name: "Gerar token" }).last().click();

    await expect.poll(() => handle.api.some((c) => c.method === "POST" && c.path.includes("export-token"))).toBe(true);
    const post = handle.api.find((c) => c.method === "POST" && c.path.includes("export-token"))!;
    expect(post.body).toEqual({ roomIds: [ROOM_WAR] });
    await expect(page.getByLabel(/Copie agora/)).toHaveValue("fqex_abcd_SEGREDO_COMPLETO");
  });

  test("com token ativo, trocar o escopo salva sem gerar outro token", async ({ page }) => {
    const handle = await mockSupabase(page, {
      profile: { role: "admin", is_superadmin: false },
      exportToken: { prefix: "fqex_abcd", roomIds: null },
    });
    await page.goto("/admin/integrations");
    const scope = page.getByTestId("export-scope");
    await expect(page.getByTestId("export-scope-current")).toContainText("Todas as salas da organização");

    await scope.getByLabel("Somente as salas escolhidas").check();
    await scope.getByLabel("Sprint 42: Checkout").check();
    await page.getByRole("button", { name: "Salvar salas" }).click();

    await expect.poll(() => handle.api.some((c) => c.method === "PUT")).toBe(true);
    expect(handle.api.find((c) => c.method === "PUT")!.body).toEqual({ roomIds: [ROOM_WAR] });
    expect(handle.api.some((c) => c.method === "POST" && c.path.includes("export-token"))).toBe(false);
    await expect(page.getByTestId("export-scope-current")).toContainText("Sprint 42: Checkout");
  });

  test("quem não é admin vê o painel bloqueado e nem consulta o token", async ({ page }) => {
    const handle = await mockSupabase(page, { profile: { role: "qa", is_superadmin: false } });
    await page.goto("/admin/integrations");
    await expect(page.getByTestId("export-token-locked")).toContainText("só um admin gera, troca ou revoga");
    await expect(page.getByTestId("export-scope")).toHaveCount(0);
    // O webhook segue disponível para quem tem a permissão de integrações.
    await expect(page.getByText("Webhook Slack / Discord")).toBeVisible();
    expect(handle.api.some((c) => c.path.includes("export-token"))).toBe(false);
  });
});
