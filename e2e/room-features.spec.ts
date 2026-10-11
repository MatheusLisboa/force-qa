import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock";
import { bugs, ROOM_WAR } from "./support/fixtures";

const PIX = bugs[0].title;
const CUPOM = bugs[1].title;

test.describe("filtros na URL", () => {
  test("filtros viram parâmetros e sobrevivem ao recarregar", async ({ page }) => {
    await mockSupabase(page);
    await page.goto(`/?room=${ROOM_WAR}`);
    await page.getByRole("button", { name: new RegExp(`^${PIX}`) }).waitFor();

    await page.getByPlaceholder(/Pesquisar por título/).fill("cupom");
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("cupom");
    await expect(page.getByRole("button", { name: new RegExp(`^${PIX}`) })).toHaveCount(0);
    await expect(page.getByRole("button", { name: new RegExp(`^${CUPOM}`) })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("room")).toBe(ROOM_WAR);

    await page.reload();
    await expect(page.getByPlaceholder(/Pesquisar por título/)).toHaveValue("cupom");
    await expect(page.getByRole("button", { name: new RegExp(`^${CUPOM}`) })).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(`^${PIX}`) })).toHaveCount(0);
  });

  test("abrir um link com filtro já mostra a visão filtrada e Limpar remove tudo", async ({ page }) => {
    await mockSupabase(page);
    await page.goto(`/?room=${ROOM_WAR}&sev=blocker`);
    await expect(page.getByRole("button", { name: new RegExp(`^${PIX}`) })).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(`^${CUPOM}`) })).toHaveCount(0);

    await page.getByTestId("clear-filters").click();
    await expect(page.getByRole("button", { name: new RegExp(`^${CUPOM}`) })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.has("sev")).toBe(false);
  });

  test("valores inválidos na URL são ignorados", async ({ page }) => {
    await mockSupabase(page);
    await page.goto(`/?room=${ROOM_WAR}&sev=<script>&env=xx`);
    await expect(page.getByRole("button", { name: new RegExp(`^${PIX}`) })).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(`^${CUPOM}`) })).toBeVisible();
  });
});

test.describe("novo card", () => {
  test("modelo de descrição por tipo e aviso de card parecido", async ({ page }) => {
    await mockSupabase(page);
    await page.goto(`/?room=${ROOM_WAR}`);
    await page.getByRole("button", { name: new RegExp(`^${PIX}`) }).waitFor();
    await page.keyboard.press("n");

    const dialog = page.getByRole("dialog").first();
    await expect(dialog.getByPlaceholder(/Erro 500 ao confirmar/)).toBeVisible();
    await expect(dialog.getByPlaceholder("Passos, logs e comportamento observado...")).toHaveValue(/Contexto \(usuário, dispositivo, build\)/);

    await dialog.getByPlaceholder(/Erro 500 ao confirmar/).fill("Pix não confirma o pedido na tela final");
    const similar = dialog.locator("#similar-bugs");
    await expect(similar).toContainText("Já existe algo parecido");
    await expect(similar.getByRole("link", { name: PIX })).toHaveAttribute("href", /card=/);

    await dialog.getByPlaceholder(/Erro 500 ao confirmar/).fill("Tela de login lenta no Safari antigo");
    await expect(similar).toHaveCount(0);
  });
});

test.describe("ações em lote", () => {
  test("Espaço marca cards, a barra aparece e Mover para coluna atualiza os cards", async ({ page }) => {
    const handle = await mockSupabase(page);
    await page.goto(`/?room=${ROOM_WAR}`);
    const pix = page.getByRole("button", { name: new RegExp(`^${PIX}`) });
    const cupom = page.getByRole("button", { name: new RegExp(`^${CUPOM}`) });
    await pix.waitFor();

    await pix.focus();
    await page.keyboard.press("Space");
    await cupom.focus();
    await page.keyboard.press("Space");

    const bar = page.getByRole("region", { name: "Ações em lote" });
    await expect(bar).toContainText("2 selecionados");

    await bar.getByLabel("Mover selecionados para").selectOption({ label: "Em análise" });
    await expect(page.getByText("2 cards movidos para Em análise.")).toBeVisible();
    await expect(page.locator(".fq-kanban-column").nth(1).getByText(PIX)).toBeVisible();
    await expect(bar).toHaveCount(0);

    const patches = handle.writes.filter((w) => w.table === "bugs" && w.method === "PATCH");
    expect(patches).toHaveLength(2);
    expect(patches.every((p) => (p.body as { status?: string }).status === "under_analysis")).toBe(true);
  });

  test("falha no lote desfaz a mudança e mantém só os que falharam selecionados", async ({ page }) => {
    await mockSupabase(page, { failWrites: true });
    await page.goto(`/?room=${ROOM_WAR}`);
    const pix = page.getByRole("button", { name: new RegExp(`^${PIX}`) });
    await pix.waitFor();
    await pix.focus();
    await page.keyboard.press("Space");

    const bar = page.getByRole("region", { name: "Ações em lote" });
    await bar.getByLabel("Mover selecionados para").selectOption({ label: "Em análise" });
    await expect(page.getByText(/0 movidos para Em análise, 1 falharam/)).toBeVisible();
    await expect(page.locator(".fq-kanban-column").first().getByText(PIX)).toBeVisible();
    await expect(bar).toContainText("1 selecionado");
  });

  test("Esc limpa a seleção", async ({ page }) => {
    await mockSupabase(page);
    await page.goto(`/?room=${ROOM_WAR}`);
    const pix = page.getByRole("button", { name: new RegExp(`^${PIX}`) });
    await pix.waitFor();
    await pix.focus();
    await page.keyboard.press("Space");
    await expect(page.getByRole("region", { name: "Ações em lote" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("region", { name: "Ações em lote" })).toHaveCount(0);
  });

  test("a barra de lote oferece atribuição quando há permissão", async ({ page }) => {
    await mockSupabase(page);
    await page.goto(`/?room=${ROOM_WAR}`);
    const pix = page.getByRole("button", { name: new RegExp(`^${PIX}`) });
    await pix.waitFor();
    await pix.focus();
    await page.keyboard.press("Space");
    const assign = page.getByLabel("Atribuir selecionados a");
    await expect(assign).toBeVisible();
    await expect(assign.locator("option", { hasText: "Rafael Lima" })).toHaveCount(1);
  });
});
