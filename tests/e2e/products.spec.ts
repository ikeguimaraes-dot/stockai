import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
test('database: product categories and CMV persist through XML and edits', async ({ page }) => {
  test.skip(!process.env.STOCKAI_TEST_DATABASE, 'Local database only');
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !['localhost', '127.0.0.1'].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname)
  )
    throw new Error('Set the local database URL explicitly for this test');
  const status = JSON.parse(
    execFileSync('supabase', ['status', '--output', 'json'], { encoding: 'utf8' }),
  );
  const url = status.API_URL;
  if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname))
    throw new Error('Local database only');
  const email = `company-${Date.now()}@stockai.local`;
  const password = 'Company.local.2026';
  const key = status.SERVICE_ROLE_KEY;
  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  expect(response.ok).toBeTruthy();
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar na operação' }).click();
  await expect(page.getByRole('heading', { name: 'Cadastre sua empresa.' })).toBeVisible({
    timeout: 20000,
  });
  await expect(page).toHaveURL(/\/empresas$/);
  await page.getByLabel('Nome fantasia').fill('Empresa Centro');
  await page.getByLabel('Razão social').fill('Empresa Centro Ltda');
  await page.getByLabel('CNPJ', { exact: true }).fill('12.345.678/0001-95');
  await page.getByRole('button', { name: 'Salvar empresa e continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Tudo sob controle.' })).toBeVisible();
  await page.getByRole('link', { name: 'Produtos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Produtos e categorias' })).toBeVisible();
  await page.getByRole('button', { name: 'Nova categoria', exact: true }).click();
  await page.getByLabel('Nome da categoria').fill('Alimentos');
  await page.getByRole('button', { name: 'Salvar categoria', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('salvo com sucesso');
  await page.getByRole('button', { name: 'Novo produto', exact: true }).click();
  await page.getByLabel('Nome do produto').fill('Papel toalha');
  await page.getByLabel('Compõe CMV?', { exact: true }).selectOption('false');
  await page.getByRole('button', { name: 'Salvar produto', exact: true }).click();
  await expect(page.getByRole('article').filter({ hasText: 'Papel toalha' })).toContainText(
    'Compõe CMV: Não',
  );
  await page.getByRole('link', { name: 'Voltar à operação' }).click();
  await page.getByRole('button', { name: 'Importar XML', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Arquivo XML da NF-e').setInputFiles('tests/fixtures/nfe.xml');
  await expect(dialog.getByText('NF-e 123 · Série 1', { exact: true })).toBeVisible();
  await dialog.getByLabel('Categoria do item 1').selectOption({ label: 'Alimentos' });
  await dialog.getByLabel('Compõe CMV do item 1').selectOption('true');
  await dialog.getByLabel('Quantidade por embalagem do item 2').fill('6');
  await dialog.getByLabel('Compõe CMV do item 2').selectOption('false');
  await dialog.getByRole('button', { name: 'Importar e iniciar conferência' }).click();
  await expect(dialog.getByText('Conte primeiro. Compare depois.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Conferir depois' }).click();
  await page.getByRole('link', { name: 'Produtos', exact: true }).click();
  await expect(page.getByRole('article').filter({ hasText: 'Arroz' })).toContainText('Alimentos');
  await expect(page.getByRole('article').filter({ hasText: 'Arroz' })).toContainText(
    'Compõe CMV: Sim',
  );
  await expect(page.getByRole('article').filter({ hasText: 'Leite' })).toContainText(
    'Compõe CMV: Não',
  );
  await page.getByLabel('Filtrar CMV').selectOption('true');
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByLabel('Filtrar CMV').selectOption('all');
  await page.getByRole('button', { name: 'Editar produto Leite', exact: true }).click();
  await page.getByLabel('Categoria do produto').selectOption({ label: 'Alimentos' });
  await page.getByLabel('Compõe CMV?', { exact: true }).selectOption('true');
  await page.getByRole('button', { name: 'Salvar produto', exact: true }).click();
  await expect(page.getByRole('article').filter({ hasText: 'Leite' })).toContainText(
    'Compõe CMV: Sim',
  );
  await page.reload();
  await expect(page.getByRole('article').filter({ hasText: 'Leite' })).toContainText('Alimentos');
  await page.getByText('Categorias cadastradas (1)', { exact: true }).click();
  await page.getByRole('button', { name: 'Editar categoria Alimentos', exact: true }).click();
  await page.getByLabel('Nome da categoria').fill('Alimentos e bebidas');
  await page.getByRole('button', { name: 'Salvar categoria', exact: true }).click();
  await expect(page.getByRole('article').filter({ hasText: 'Arroz' })).toContainText(
    'Alimentos e bebidas',
  );
  await page.screenshot({ path: '/tmp/stockai-products-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/stockai-products-mobile.png', fullPage: true });
});
