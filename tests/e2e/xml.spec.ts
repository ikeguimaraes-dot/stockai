import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
test('database: durable XML inbox, learned mapping and receipt revisions', async ({ page }) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(12000);
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
  const original = readFileSync('tests/fixtures/nfe.xml', 'utf8');
  function invoice(n: number) {
    const old = '35260911222333000181550010000001231123456783';
    const base = old.slice(0, 25) + String(n).padStart(9, '0') + old.slice(34, 43);
    let sum = 0;
    for (let i = 42, w = 2; i >= 0; i--, w = w === 9 ? 2 : w + 1) sum += Number(base[i]) * w;
    const remainder = sum % 11;
    const key = base + String(remainder < 2 ? 0 : 11 - remainder);
    return original.replaceAll(old, key).replace('<nNF>123</nNF>', `<nNF>${n}</nNF>`);
  }
  await page.getByRole('button', { name: 'Importar XML', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Arquivo XML da NF-e').setInputFiles([
    { name: 'nota-123.xml', mimeType: 'application/xml', buffer: Buffer.from(original) },
    { name: 'invalido.xml', mimeType: 'application/xml', buffer: Buffer.from('<invalid>') },
    {
      name: 'outra-empresa.xml',
      mimeType: 'application/xml',
      buffer: Buffer.from(
        original.replace('<dest><CNPJ>12345678000195', '<dest><CNPJ>99999999000191'),
      ),
    },
    ...Array.from({ length: 22 }, (_, i) => ({
      name: `copia-${i}.xml`,
      mimeType: 'application/xml',
      buffer: Buffer.from(original),
    })),
  ]);
  await expect(dialog.getByRole('status')).toContainText('Envio concluído', { timeout: 60000 });
  await expect(dialog.getByText('Salva para identificação', { exact: true })).toHaveCount(25);
  await dialog.getByRole('link', { name: 'Abrir Identificação' }).click();
  await expect(page).toHaveURL(/\/identificacao$/);
  await page.reload();
  await page.getByRole('button', { name: /nota-123.xml/ }).click();
  await expect(page.getByText('NF-e 123 · Fornecedor XML Teste')).toBeVisible();
  await page.getByRole('button', { name: 'Nova categoria', exact: true }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Alimentos');
  await page.getByRole('button', { name: 'Salvar cadastro' }).click();
  await expect(page.getByRole('status')).toContainText('Cadastro salvo');
  for (const product of [
    { name: 'Arroz interno', code: 'AR-01', unit: 'KG' },
    { name: 'Leite interno', code: 'LE-01', unit: 'UN' },
  ]) {
    await page.getByRole('button', { name: 'Novo produto interno', exact: true }).click();
    await page.getByLabel('Nome', { exact: true }).fill(product.name);
    await page.getByLabel('Código interno', { exact: true }).fill(product.code);
    await page.getByLabel('Unidade', { exact: true }).selectOption(product.unit);
    await page.getByLabel('Categoria', { exact: true }).selectOption({ label: 'Alimentos' });
    await page.getByLabel('Compõe CMV?', { exact: true }).selectOption('true');
    await page.getByRole('button', { name: 'Salvar cadastro' }).click();
    await expect(
      page.getByRole('heading', { name: 'Novo produto interno', exact: true }),
    ).toHaveCount(0);
  }
  await page
    .getByLabel('Meu produto do item 1')
    .selectOption({ label: 'AR-01 — Arroz interno (KG)' });
  await page
    .getByLabel('Meu produto do item 2')
    .selectOption({ label: 'LE-01 — Leite interno (UN)' });
  await page.getByLabel('Conversão do item 2').fill('6');
  await page.screenshot({ path: '/tmp/stockai-identification-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/stockai-identification-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Vincular e lançar nota' }).click();
  await expect(page.getByRole('link', { name: 'Abrir nota e editar' })).toBeVisible();
  const href = await page.getByRole('link', { name: 'Abrir nota e editar' }).getAttribute('href');
  const receiptId = href!.split('/').at(-1);
  await page.goto('/operacao');
  await page.getByRole('button', { name: 'Recebimentos', exact: true }).click();
  await expect(page.getByText('3 XMLs enviados', { exact: true })).toBeVisible();
  await expect(
    page.getByText('1 com recebimento criado · 2 aguardando identificação', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver XMLs em Identificação' })).toBeVisible();
  await page.screenshot({ path: '/tmp/stockai-receipts-xml-summary.png', fullPage: true });
  await page
    .getByRole('button', { name: /Abrir recebimento de/ })
    .first()
    .click();
  const receipt = page.getByRole('dialog');
  await expect(receipt.getByText('Na nota: 2 CX', { exact: true })).toBeVisible();
  await expect(receipt.getByText('Equivalente no estoque: 12 UN.', { exact: false })).toBeVisible();
  await page.goto(`/conferencia/${receiptId}`);
  await expect(page.getByText('Na nota: 2 CX', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Veio certo: Arroz interno', exact: true }).click();
  await expect(page.getByLabel('Quantidade de Arroz interno')).toHaveValue('10');
  await page.getByRole('button', { name: 'Preencher tudo conforme a nota' }).click();
  await expect(page.getByLabel('Quantidade de Leite interno')).toHaveValue('12');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/stockai-count-quantities-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Finalizar conferência' }).click();
  await expect(page.getByText('Conferência registrada.', { exact: true })).toBeVisible();
  await page.goto(href!);
  await page.getByLabel('Quantidade na nota 1', { exact: true }).fill('8');
  await page.getByLabel('Quantidade recebida 1', { exact: true }).fill('7');
  await page.getByLabel('Motivo da alteração').fill('Corrigir quantidade recebida');
  await page.getByRole('button', { name: 'Salvar alteração' }).click();
  await expect(page.getByText('Recebimentos · Versão 1', { exact: true })).toBeVisible();
  await expect(page.getByText(/Versão 1 ·.*Corrigir quantidade/)).toBeVisible();
  const xml = await page.request.get(`/api/notas/${receiptId}/xml`);
  expect(xml.ok()).toBeTruthy();
  expect(await xml.text()).toBe(original);
  await page.screenshot({ path: '/tmp/stockai-note-editor.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/stockai-note-editor-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/operacao');
  await page.getByRole('button', { name: 'Importar XML', exact: true }).click();
  await page.getByLabel('Arquivo XML da NF-e').setInputFiles({
    name: 'nota-124.xml',
    mimeType: 'application/xml',
    buffer: Buffer.from(invoice(124)),
  });
  await expect(page.getByRole('dialog').getByText('Importada', { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole('link', { name: 'Abrir Identificação' }).click();
  await expect(page.getByRole('button', { name: /invalido.xml/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /outra-empresa.xml/ })).toBeVisible();
});
