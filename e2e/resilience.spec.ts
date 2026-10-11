import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock";

test.describe("servidor fora do ar", () => {
  test("login mostra aviso de servidor indisponível e permite tentar de novo", async ({ page }) => {
    await mockSupabase(page, { signedIn: false });
    let healthy = false;
    await page.route("https://e2e.supabase.test/auth/v1/health", (route) =>
      healthy ? route.fulfill({ status: 200, body: "{}", headers: { "access-control-allow-origin": "*" } }) : route.abort("connectionfailed")
    );
    await page.goto("/");

    const banner = page.getByTestId("backend-status");
    await expect(banner).toContainText("Não conseguimos falar com o servidor");

    healthy = true;
    await banner.getByRole("button", { name: "Tentar de novo" }).click();
    await expect(banner).toHaveCount(0);
  });

  test("login com a rede caindo mostra mensagem amigável, não o erro cru", async ({ page }) => {
    await mockSupabase(page, { signedIn: false });
    await page.route("https://e2e.supabase.test/auth/v1/token*", (route) => route.abort("connectionfailed"));
    await page.goto("/");

    await page.getByPlaceholder("Ex: dba@empresa.com").fill("qa@empresa.com");
    await page.getByPlaceholder("••••••••").fill("123456");
    await page.locator("form").getByRole("button", { name: "Entrar" }).click();

    await expect(page.getByText(/Não foi possível falar com o servidor/)).toBeVisible();
    await expect(page.getByText("Failed to fetch")).toHaveCount(0);
  });

  test("com o servidor saudável não aparece aviso", async ({ page }) => {
    await mockSupabase(page, { signedIn: false });
    await page.goto("/");
    await page.getByPlaceholder("Ex: dba@empresa.com").waitFor();
    await expect(page.getByTestId("backend-status")).toHaveCount(0);
  });
});
