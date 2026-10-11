import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock";
import { bugs, ROOM_WAR } from "./support/fixtures";

const PIX = "Pagamento com Pix não confirma o pedido";

test.describe("paleta de comandos e atalhos", () => {
  test("Ctrl+K abre, filtra e navega até a sala", async ({ page }) => {
    await mockSupabase(page);
    await page.goto("/");
    await page.getByText("Sprint 42: Checkout").first().waitFor();

    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Paleta de comandos" });
    await expect(palette).toBeVisible();
    await page.keyboard.type("sprint");
    await expect(palette.getByRole("option")).toHaveCount(1);
    await page.keyboard.press("Enter");

    await expect(page.getByText(PIX).first()).toBeVisible();
    await expect(palette).toHaveCount(0);
  });

  test("? abre a ajuda de atalhos e Esc fecha", async ({ page }) => {
    await mockSupabase(page);
    await page.goto("/");
    await page.getByText("Sprint 42: Checkout").first().waitFor();
    await page.keyboard.press("Shift+Slash");
    const help = page.getByRole("dialog", { name: "Atalhos de teclado" });
    await expect(help).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(help).toHaveCount(0);
  });
});

test.describe("tema", () => {
  test("alterna e persiste entre recarregamentos", async ({ page }) => {
    await mockSupabase(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.getByText("Sprint 42: Checkout").first().waitFor();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.getByRole("button", { name: "Mudar para tema claro" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.reload();
    await page.getByText("Sprint 42: Checkout").first().waitFor();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});

test.describe("kanban", () => {
  test("cards são focáveis e Shift+→ move o card de coluna", async ({ page }) => {
    const handle = await mockSupabase(page);
    await page.goto(`/?room=${ROOM_WAR}`);
    const card = page.getByRole("button", { name: new RegExp(`^${PIX}`) });
    await card.waitFor();

    await card.focus();
    await page.keyboard.press("Shift+ArrowRight");

    await expect(page.getByText("Movido para Em análise")).toBeVisible();
    await expect.poll(() => handle.writes.some((w) => w.table === "bugs" && w.method === "PATCH")).toBe(true);
    const patch = handle.writes.find((w) => w.table === "bugs" && w.method === "PATCH");
    expect(patch?.body).toMatchObject({ status: "under_analysis" });
  });

  test("falha ao mover desfaz a mudança otimista", async ({ page }) => {
    await mockSupabase(page, { failWrites: true });
    await page.goto(`/?room=${ROOM_WAR}`);
    const card = page.getByRole("button", { name: new RegExp(`^${PIX}`) });
    await card.waitFor();
    await card.focus();
    await page.keyboard.press("Shift+ArrowRight");

    await expect(page.locator(".fq-toast--error")).toBeVisible();
    // O card volta para a coluna "Novo" (primeira coluna do quadro).
    const firstColumn = page.locator(".fq-kanban-column").first();
    await expect(firstColumn.getByText(PIX)).toBeVisible();
  });

  test("Enter abre o card", async ({ page }) => {
    await mockSupabase(page);
    await page.goto(`/?room=${ROOM_WAR}`);
    const card = page.getByRole("button", { name: new RegExp(`^${bugs[1].title}`) });
    await card.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog").first()).toBeVisible();
  });
});

test.describe("conexão", () => {
  test("mostra aviso quando o navegador fica offline", async ({ page, context }) => {
    await mockSupabase(page);
    await page.goto("/");
    await page.getByText("Sprint 42: Checkout").first().waitFor();
    await context.setOffline(true);
    await expect(page.getByText(/Você está offline/)).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByText(/Você está offline/)).toHaveCount(0);
  });
});

test.describe("acessibilidade básica", () => {
  test("link de pulo, landmarks e nome acessível dos botões do cabeçalho", async ({ page }) => {
    await mockSupabase(page);
    await page.goto("/");
    await page.getByText("Sprint 42: Checkout").first().waitFor();
    await expect(page.locator("a.fq-skip-link")).toHaveAttribute("href", "#fq-main");
    await expect(page.locator("main#fq-main")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /^Notificações, 1 não lidas/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Perfil de Marina Souza/ })).toBeVisible();
  });

  test("respeita prefers-reduced-motion", async ({ page }) => {
    await mockSupabase(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/design");
    const duration = await page.evaluate(() => {
      const el = document.querySelector(".fq-skeleton");
      return el ? getComputedStyle(el).animationName : "none";
    });
    expect(duration).toBe("none");
  });
});
