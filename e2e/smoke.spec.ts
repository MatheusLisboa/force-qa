import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock";

test("sem sessão, mostra a tela de login sem cadastro público", async ({ page }) => {
  await mockSupabase(page, { signedIn: false });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /entrar/i }).first()).toBeVisible();
  await expect(page.getByText(/criar conta|cadastre-se/i)).toHaveCount(0);
});

test("logado, o painel lista as salas", async ({ page }) => {
  await mockSupabase(page);
  await page.goto("/");
  await expect(page.getByText("Sprint 42: Checkout").first()).toBeVisible();
  await expect(page.getByText("App Mobile").first()).toBeVisible();
});
