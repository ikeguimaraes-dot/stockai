import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

test('database: first company is required and invoices retain the selected destination', async ({
  page,
}) => {
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
  await expect(page).toHaveURL(/\/empresas$/);
  await page.getByLabel('Nome fantasia').fill('Empresa Centro');
  await page.getByLabel('Razão social').fill('Empresa Centro Ltda');
  await page.getByLabel('CNPJ', { exact: true }).fill('123');
  await page.getByRole('button', { name: 'Salvar empresa e continuar' }).click();
  await expect(page.locator('p[role=alert]')).toContainText('14 posições');
  await page.getByLabel('CNPJ', { exact: true }).fill('12.345.678/0001-95');
  await page.screenshot({ path: '/tmp/stockai-company-onboarding.png', fullPage: true });
  await page.getByRole('button', { name: 'Salvar empresa e continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Tudo sob controle.' })).toBeVisible();
  await page.getByRole('link', { name: 'Empresas', exact: true }).click();
  await page.getByLabel('Empresa a cadastrar ou atualizar').selectOption('');
  await page.getByLabel('Nome fantasia').fill('Empresa Jardins');
  await page.getByLabel('Razão social').fill('Empresa Jardins Ltda');
  await page.getByLabel('CNPJ', { exact: true }).fill('11222333000181');
  await page.getByRole('button', { name: 'Salvar empresa e continuar' }).click();
  await page.getByRole('button', { name: 'Novo recebimento' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Empresa destinatária')).toHaveValue('');
  await dialog
    .getByLabel('Empresa destinatária')
    .selectOption({ label: 'Empresa Jardins · 11.222.333/0001-81' });
  await dialog.getByLabel('Fornecedor', { exact: true }).fill('Fornecedor teste');
  await dialog.getByLabel('Número da nota').fill('001');
  await dialog.getByLabel('Insumo', { exact: true }).fill('Tomate');
  await dialog.getByLabel('Qtd. na nota').fill('10');
  await dialog.getByLabel('Preço unit. (R$)').fill('5');
  await page.screenshot({ path: '/tmp/stockai-company-receipt.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Iniciar conferência' }).click();
  await expect(dialog.getByText(/Destinatária: Empresa Jardins Ltda/)).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Abrir recebimento de Fornecedor teste' }).click();
  await expect(page.getByRole('dialog').getByText(/11.222.333\/0001-81/)).toBeVisible();
});
