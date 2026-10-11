import { test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mockSupabase } from "./support/supabaseMock";
import { bugs, ROOM_WAR } from "./support/fixtures";

/**
 * Gera as imagens de docs/screenshots. Roda só com `npm run screenshots`
 * (variável SCREENSHOTS=1), para não custar tempo no CI.
 */
test.skip(!process.env.SCREENSHOTS, "defina SCREENSHOTS=1 (use npm run screenshots)");

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "screenshots");
const shot = (name: string) => ({ path: path.join(OUT, `${name}.png`), animations: "disabled" as const });

for (const theme of ["dark", "light"] as const) {
  test.describe(`tema ${theme}`, () => {
    test.use({ colorScheme: theme });

    test(`telas principais (${theme})`, async ({ page }) => {
      const handle = await mockSupabase(page);
      void handle;
      await page.addInitScript((value) => localStorage.setItem("forceqa.theme", value), theme);

      await page.goto("/");
      await page.getByText("Sprint 42: Checkout").first().waitFor();
      await page.waitForTimeout(400);
      await page.screenshot(shot(`01-painel-${theme}`));

      await page.goto(`/?room=${ROOM_WAR}`);
      await page.getByText("Pagamento com Pix não confirma o pedido").first().waitFor();
      await page.waitForTimeout(400);
      await page.screenshot(shot(`02-kanban-${theme}`));

      // Seleção em lote
      const card = (index: number) => page.getByRole("button", { name: new RegExp(`^${bugs[index].title}`) });
      await card(0).focus();
      await page.keyboard.press("Space");
      await card(1).focus();
      await page.keyboard.press("Space");
      await page.getByRole("region", { name: "Ações em lote" }).waitFor();
      await page.waitForTimeout(250);
      await page.screenshot(shot(`08-lote-${theme}`));
      await page.keyboard.press("Escape");

      // Card com comentários (markdown, menção, imagem do Storage, código)
      await card(0).click();
      await page.getByRole("textbox", { name: "Novo comentário" }).waitFor();
      await page.getByRole("textbox", { name: "Novo comentário" }).pressSequentially("Vou olhar isso @raf");
      await page.waitForTimeout(300);
      await page.screenshot(shot(`09-comentarios-${theme}`));
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");

      // Métricas
      await page.getByRole("button", { name: "Mais" }).first().click();
      await page.getByRole("button", { name: "Métricas" }).click();
      await page.getByTestId("metrics-panel").waitFor();
      await page.waitForTimeout(250);
      await page.screenshot(shot(`10-metricas-${theme}`));
      await page.getByRole("button", { name: "Voltar ao kanban" }).click();

      await page.keyboard.press("Control+k");
      await page.getByRole("dialog", { name: "Paleta de comandos" }).waitFor();
      await page.keyboard.type("sprint");
      await page.waitForTimeout(200);
      await page.screenshot(shot(`03-paleta-${theme}`));
      await page.keyboard.press("Escape");

      await page.keyboard.press("Shift+Slash");
      await page.getByRole("dialog", { name: "Atalhos de teclado" }).waitFor();
      await page.screenshot(shot(`04-atalhos-${theme}`));
    });
  });
}

test("vitrine do design system", async ({ page }) => {
  await mockSupabase(page, { signedIn: false });
  for (const theme of ["dark", "light"] as const) {
    await page.addInitScript((value) => localStorage.setItem("forceqa.theme", value), theme);
    await page.goto("/design");
    await page.getByRole("heading", { name: "ForceQA UI" }).waitFor();
    await page.screenshot({ ...shot(`05-design-system-${theme}`), fullPage: true });
  }
});

test("login e mobile", async ({ page, browser }) => {
  await mockSupabase(page, { signedIn: false });
  await page.goto("/");
  await page.getByRole("button", { name: /entrar/i }).first().waitFor();
  await page.screenshot(shot("06-login"));

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "pt-BR" });
  const mobile = await context.newPage();
  await mockSupabase(mobile);
  await mobile.goto(`/?room=${ROOM_WAR}`);
  await mobile.getByText("Pagamento com Pix não confirma o pedido").first().waitFor();
  await mobile.waitForTimeout(400);
  await mobile.screenshot(shot("07-kanban-mobile"));
  await context.close();
});

test("servidor fora do ar no login", async ({ page }) => {
  await mockSupabase(page, { signedIn: false });
  await page.route("https://e2e.supabase.test/auth/v1/health", (route) => route.abort("connectionfailed"));
  await page.goto("/");
  await page.getByTestId("backend-status").waitFor();
  await page.screenshot(shot("11-login-servidor-fora"));
});
