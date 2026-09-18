import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
test('database: XML preview, conversion, count, duplicate and wrong destination', async ({
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
  await expect(page.getByRole('heading', { name: 'Cadastre sua empresa.' })).toBeVisible({
    timeout: 20000,
  });
  await expect(page).toHaveURL(/\/empresas$/);
  await page.getByLabel('Nome fantasia').fill('Empresa Centro');
  await page.getByLabel('Razão social').fill('Empresa Centro Ltda');
  await page.getByLabel('CNPJ', { exact: true }).fill('12.345.678/0001-95');
  await page.getByRole('button', { name: 'Salvar empresa e continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Tudo sob controle.' })).toBeVisible();
  await page.getByRole('button', { name: 'Importar XML', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Arquivo XML da NF-e').setInputFiles('tests/fixtures/nfe.xml');
  await expect(dialog.getByText('NF-e 123 · Série 1', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Empresa destinatária')).not.toHaveValue('');
  await expect(
    dialog.getByRole('button', { name: 'Importar e iniciar conferência' }),
  ).toBeDisabled();
  await dialog.getByLabel('Quantidade por embalagem do item 2').fill('6');
  await expect(dialog.getByText('Total: 12 UN')).toBeVisible();
  await page.screenshot({ path: '/tmp/stockai-xml-preview.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await dialog.evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({ path: '/tmp/stockai-xml-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await dialog.getByRole('button', { name: 'Importar e iniciar conferência' }).click();
  await expect(dialog.getByText('Conte primeiro. Compare depois.')).toBeVisible();
  await expect(dialog.getByText('R$ 190,00', { exact: true })).toHaveCount(0);
  await dialog.getByLabel('Quantidade de Arroz').fill('9');
  await dialog.getByLabel('Quantidade de Leite').fill('12');
  await dialog.getByRole('button', { name: 'Finalizar conferência' }).click();
  await expect(dialog.getByText('R$ 12,00', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Mercadorias a pagar', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Aprovar recebimento' }).click();
  await expect(dialog.getByText('Recebimento registrado')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Importar XML', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Arquivo XML da NF-e').setInputFiles('tests/fixtures/nfe.xml');
  await expect(dialog.getByRole('alert')).toContainText('já foi importada');
  await expect(
    dialog.getByRole('button', { name: 'Importar e iniciar conferência' }),
  ).toBeDisabled();
  const wrong = readFileSync('tests/fixtures/nfe.xml', 'utf8').replace(
    '<dest><CNPJ>12345678000195',
    '<dest><CNPJ>99999999000191',
  );
  await dialog
    .getByLabel('Arquivo XML da NF-e')
    .setInputFiles({ name: 'wrong.xml', mimeType: 'application/xml', buffer: Buffer.from(wrong) });
  await expect(dialog.getByRole('alert')).toContainText('não corresponde');
  await expect(dialog.getByRole('button', { name: 'Importar e iniciar conferência' })).toHaveCount(
    0,
  );
});
