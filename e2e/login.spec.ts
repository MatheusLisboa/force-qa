import { expect, test, type Page } from '@playwright/test';

const SUPABASE = 'https://e2e.supabase.test';

/** Nenhuma chamada sai para a rede real: sem sessão, e auth respondendo o que o teste pedir. */
async function stubSupabase(page: Page, authTokenResponse?: { status: number; body: object }) {
  await page.route(`${SUPABASE}/**`, async (route) => {
    const url = route.request().url();
    if (authTokenResponse && url.includes('/auth/v1/token')) {
      return route.fulfill({
        status: authTokenResponse.status,
        contentType: 'application/json',
        body: JSON.stringify(authTokenResponse.body),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

test.describe('Tela de login', () => {
  test('mostra o formulário de e-mail por padrão', async ({ page }) => {
    await stubSupabase(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Entre para continuar' })).toBeVisible();
    await expect(page.getByPlaceholder('Ex: dba@empresa.com')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar', exact: true }).last()).toBeVisible();
  });

  test('não expõe cadastro público', async ({ page }) => {
    await stubSupabase(page);
    await page.goto('/');

    await expect(page.getByText(/criar conta|cadastre-se/i)).toHaveCount(0);
  });

  test('rejeita senha com menos de 6 caracteres antes de chamar a API', async ({ page }) => {
    let authCalls = 0;
    await stubSupabase(page);
    await page.route(`${SUPABASE}/auth/v1/token*`, (route) => {
      authCalls += 1;
      return route.abort();
    });
    await page.goto('/');

    await page.getByPlaceholder('Ex: dba@empresa.com').fill('qa@empresa.com');
    await page.getByPlaceholder('••••••••').fill('12345');
    await page.locator('form').getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByText('A senha deve conter no mínimo 6 caracteres.')).toBeVisible();
    expect(authCalls).toBe(0);
  });

  test('mostra erro amigável para credenciais inválidas', async ({ page }) => {
    await stubSupabase(page, {
      status: 400,
      body: { code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' },
    });
    await page.goto('/');

    await page.getByPlaceholder('Ex: dba@empresa.com').fill('qa@empresa.com');
    await page.getByPlaceholder('••••••••').fill('senha-errada');
    await page.locator('form').getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByText(/E-mail ou senha incorretos/)).toBeVisible();
  });

  test('"Esqueci a senha" só habilita com e-mail preenchido', async ({ page }) => {
    await stubSupabase(page);
    await page.goto('/');

    const forgot = page.getByRole('button', { name: 'Esqueci a senha' });
    await expect(forgot).toBeDisabled();

    await page.getByPlaceholder('Ex: dba@empresa.com').fill('qa@empresa.com');
    await expect(forgot).toBeEnabled();
  });
});

test.describe('Entrada como convidado', () => {
  test('a aba Convidado pede nome, área e link de convite', async ({ page }) => {
    await stubSupabase(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Convidado' }).click();

    await expect(page.getByPlaceholder('Como você quer aparecer na sala')).toBeVisible();
    await expect(page.getByPlaceholder(/Cole o link completo/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar na sala' })).toBeVisible();
  });

  test('link sem token de convidado é recusado com mensagem clara', async ({ page }) => {
    await stubSupabase(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Convidado' }).click();

    await page.getByPlaceholder('Como você quer aparecer na sala').fill('Maria');
    await page.locator('select').selectOption({ index: 1 });
    await page.getByPlaceholder(/Cole o link completo/).fill('https://forceqa.test/?room=abc');
    await page.getByRole('button', { name: 'Entrar na sala' }).click();

    await expect(page.getByText(/não tem o convite de convidado/)).toBeVisible();
  });

  test('a área é obrigatória para entrar como convidado', async ({ page }) => {
    await stubSupabase(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Convidado' }).click();

    await page.getByPlaceholder('Como você quer aparecer na sala').fill('Maria');
    await page.getByPlaceholder(/Cole o link completo/).fill('https://forceqa.test/?guest=gst_teste123');
    await page.getByRole('button', { name: 'Entrar na sala' }).click();

    await expect(page.locator('select:invalid')).toHaveCount(1);
  });

  test('abrir um link de convite já cai na aba Convidado', async ({ page }) => {
    await stubSupabase(page);
    await page.goto('/?guest=gst_teste123');

    await expect(page.getByPlaceholder('Como você quer aparecer na sala')).toBeVisible();
  });
});
