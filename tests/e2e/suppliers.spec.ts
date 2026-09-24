import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
test('database: supplier references are searchable before any receipt', async ({ page }) => {
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
  const created = await response.json();
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
  const adminHeaders = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
  const membership = await fetch(
    `${url}/rest/v1/stockai_memberships?user_id=eq.${created.id}&select=org_id`,
    { headers: adminHeaders },
  );
  const [member] = await membership.json();
  const insert = await fetch(`${url}/rest/v1/stockai_suppliers`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify([
      {
        org_id: member.org_id,
        name: 'Fornecedor Base',
        aliases: ['Nome antigo'],
        reference_labels: ['ALIMENTOS'],
        source_name: 'Base teste.xlsx',
        review_note: 'Confirmar CNPJ.',
      },
      {
        org_id: member.org_id,
        name: 'Outro cadastro',
        aliases: [],
        reference_labels: ['LIMPEZA'],
        source_name: null,
        review_note: null,
      },
    ]),
  });
  expect(insert.ok, await insert.text()).toBeTruthy();
  await page.reload();
  await page.getByRole('button', { name: 'Fornecedores', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(2);
  const card = page.getByRole('article').filter({ hasText: 'Fornecedor Base' });
  await expect(card).toContainText('CNPJ a identificar');
  await expect(card.getByRole('button', { name: 'Ver recebimentos' })).toBeDisabled();
  await page.getByLabel('Buscar fornecedor cadastrado').fill('nome antigo');
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByLabel('Buscar fornecedor cadastrado').fill('');
  await page.getByLabel('Somente cadastros para revisar').check();
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.screenshot({ path: '/tmp/stockai-suppliers-base.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/stockai-suppliers-base-mobile.png', fullPage: true });
  const product = await fetch(`${url}/rest/v1/stockai_items`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      org_id: member.org_id,
      name: 'Arroz base',
      base_uom: 'KG',
      internal_code: 'BASE-001',
      source_references: {
        links: [
          { supplier_tax_id: '11222333000181', supplier_code: 'A1', source_unit: 'KG', factor: 1 },
        ],
      },
    }),
  });
  expect(product.ok, await product.text()).toBeTruthy();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/operacao');
  await page.getByRole('button', { name: 'Importar XML', exact: true }).click();
  await page.getByLabel('Arquivo XML da NF-e').setInputFiles('tests/fixtures/nfe.xml');
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Envio concluído');
  await expect(page.getByText('Salva para identificação', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Abrir Identificação' }).click();
  await expect(page).toHaveURL(/\/identificacao$/);
  await page.getByRole('button', { name: /nfe.xml/ }).click();
  await expect(page.getByLabel('Meu produto do item 1')).not.toHaveValue('');
  await expect(page.getByLabel('Meu produto do item 2')).toHaveValue('');
  await expect(page.getByText('Alguns produtos foram sugeridos', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vincular e lançar nota' })).toBeDisabled();
});
