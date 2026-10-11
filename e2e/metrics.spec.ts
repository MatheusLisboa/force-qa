import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock";
import { ROOM_WAR } from "./support/fixtures";

async function openMetrics(page: import("@playwright/test").Page) {
  await page.goto(`/?room=${ROOM_WAR}`);
  await page.getByRole("button", { name: "Mais" }).first().click();
  await page.getByRole("button", { name: "Métricas" }).click();
  await expect(page.getByTestId("metrics-panel")).toBeVisible();
}

test.describe("métricas", () => {
  test("mostra indicadores, gráfico acessível e tabela de valores", async ({ page }) => {
    await mockSupabase(page);
    await openMetrics(page);

    const panel = page.getByTestId("metrics-panel");
    await expect(panel.getByText("Em aberto", { exact: true })).toBeVisible();
    await expect(panel.getByText("Tempo mediano de resolução")).toBeVisible();
    await expect(panel.getByText("Taxa de reabertura")).toBeVisible();
    await expect(panel.getByRole("img", { name: /Cards criados, resolvidos e backlog/ })).toBeVisible();

    await panel.getByText("Ver os valores em tabela").click();
    const rows = panel.getByRole("row");
    await expect(rows).toHaveCount(9); // cabeçalho + 8 semanas
  });

  test("Exportar PDF imprime em tema claro e restaura o tema depois", async ({ page }) => {
    await mockSupabase(page);
    await page.addInitScript(() => {
      localStorage.setItem("forceqa.theme", "dark");
      const w = window as unknown as { __printTheme?: string };
      window.print = () => {
        w.__printTheme = document.documentElement.dataset.theme;
        window.dispatchEvent(new Event("afterprint"));
      };
    });
    await openMetrics(page);
    await page.getByTestId("export-pdf").click();

    await expect.poll(() => page.evaluate(() => (window as unknown as { __printTheme?: string }).__printTheme)).toBe("light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("Voltar ao kanban", async ({ page }) => {
    await mockSupabase(page);
    await openMetrics(page);
    await page.getByRole("button", { name: "Voltar ao kanban" }).click();
    await expect(page.getByTestId("metrics-panel")).toHaveCount(0);
  });
});
