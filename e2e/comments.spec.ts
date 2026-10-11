import { expect, test, type Page } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock";
import { bugs, ROOM_WAR } from "./support/fixtures";

async function openFirstCard(page: Page) {
  await page.goto(`/?room=${ROOM_WAR}`);
  await page.getByRole("button", { name: new RegExp(`^${bugs[0].title}`) }).click();
  await expect(page.getByRole("textbox", { name: "Novo comentário" })).toBeVisible();
}

test.describe("comentários", () => {
  test("renderiza markdown, link, menção e bloco de código", async ({ page }) => {
    await mockSupabase(page);
    await openFirstCard(page);

    const dialog = page.getByRole("dialog").first();
    await expect(dialog.locator("strong", { hasText: "homologação" })).toBeVisible();
    await expect(dialog.getByText("@Marina Souza")).toBeVisible();
    await expect(dialog.getByRole("link", { name: "https://status.acme.dev/incidente" })).toHaveAttribute("rel", /noopener/);
    await expect(dialog.locator("pre", { hasText: "POST /pix/confirm 504" })).toBeVisible();
    await expect(dialog.getByRole("listitem").filter({ hasText: "erro 504 no gateway" })).toBeVisible();
  });

  test("HTML e javascript: nos comentários não executam", async ({ page }) => {
    await mockSupabase(page);
    await openFirstCard(page);

    const dialog = page.getByRole("dialog").first();
    // O HTML aparece como texto, sem virar elemento.
    await expect(dialog.getByText("<img src=x onerror=window.__xss=1>", { exact: false })).toBeVisible();
    await expect(dialog.locator("img[src='x']")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    // O link com esquema perigoso não vira <a>.
    await expect(dialog.locator('a[href^="javascript:"]')).toHaveCount(0);
  });

  test("@ abre a lista de pessoas e Enter insere o nome completo", async ({ page }) => {
    await mockSupabase(page);
    await openFirstCard(page);

    const box = page.getByRole("textbox", { name: "Novo comentário" });
    await box.click();
    await box.pressSequentially("ping @raf");
    const option = page.getByRole("listbox", { name: "Mencionar pessoa" }).getByRole("option", { name: "Rafael Lima" });
    await expect(option).toBeVisible();
    // Visível de verdade: tem altura e fica dentro da janela (não cortada pelo contêiner).
    const box2 = await page.getByRole("listbox", { name: "Mencionar pessoa" }).boundingBox();
    expect(box2 && box2.height).toBeGreaterThan(20);
    expect(box2 && box2.y).toBeGreaterThanOrEqual(0);
    await page.keyboard.press("Enter");

    await expect(box).toHaveValue("ping @Rafael Lima ");
    await expect(option).toHaveCount(0);
  });

  test("Esc fecha só a lista de menções, não o card", async ({ page }) => {
    await mockSupabase(page);
    await openFirstCard(page);

    const box = page.getByRole("textbox", { name: "Novo comentário" });
    await box.click();
    await box.pressSequentially("@c");
    await expect(page.getByRole("listbox", { name: "Mencionar pessoa" }).getByRole("option", { name: "Camila Duarte" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox", { name: "Mencionar pessoa" })).toHaveCount(0);
    await expect(box).toBeVisible();
  });

  test("colar um print envia ao Storage e insere o markdown da imagem", async ({ page }) => {
    const handle = await mockSupabase(page);
    await openFirstCard(page);

    const box = page.getByRole("textbox", { name: "Novo comentário" });
    await box.click();
    await box.evaluate((el) => {
      const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([png], "print.png", { type: "image/png" }));
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });

    await expect(box).toHaveValue(/!\[print\]\(https:\/\/e2e\.supabase\.test\/storage\/v1\/object\/public\/evidence\/.+\.png\)/);
    expect(handle.writes.some((w) => w.table.startsWith("storage:/storage/v1/object/evidence/"))).toBe(true);
  });

  test("arquivo que não é imagem é ignorado no paste", async ({ page }) => {
    const handle = await mockSupabase(page);
    await openFirstCard(page);
    const box = page.getByRole("textbox", { name: "Novo comentário" });
    await box.click();
    await box.evaluate((el) => {
      const data = new DataTransfer();
      data.items.add(new File(["x"], "nota.txt", { type: "text/plain" }));
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    expect(handle.writes.some((w) => w.table.startsWith("storage:"))).toBe(false);
  });
});
