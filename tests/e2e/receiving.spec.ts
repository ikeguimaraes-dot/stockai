import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
if (process.env.STOCKAI_TEST_DATABASE) {
  const localUrl = readFileSync('apps/web/.env.local', 'utf8').match(
    /^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m,
  )?.[1];
  if (!localUrl || !['localhost', '127.0.0.1'].includes(new URL(localUrl).hostname)) {
    throw new Error('Database browser tests only run against the local Supabase.');
  }
}
test('demo: blind count, discrepancy, approval and persistence', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'Tudo sob controle.' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir recebimento de Frigorífico Prime' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Conte primeiro. Compare depois.')).toBeVisible();
  await expect(dialog.getByText('Documento fiscal', { exact: true })).toHaveCount(0);
  await dialog.getByLabel('Quantidade de Filé mignon').fill('18');
  await dialog.getByLabel('Quantidade de Peito de frango').fill('30');
  await dialog.getByRole('button', { name: 'Finalizar conferência' }).click();
  await expect(dialog.getByText('R$ 159,80', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Aprovar recebimento' }).click();
  await expect(dialog.getByText('Recebimento registrado')).toBeVisible();
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).last().click();
  await page.reload();
  await page.getByRole('button', { name: 'Abrir recebimento de Frigorífico Prime' }).click();
  await expect(page.getByRole('dialog').getByText('Recebimento registrado')).toBeVisible();
});
test('mobile: navigation and no page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/demo');
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.getByRole('button', { name: 'Fornecedores', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Fornecedores', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('database: login, manual receipt, blind count and durable approval', async ({ page }) => {
  test.skip(
    !process.env.STOCKAI_TEST_DATABASE,
    'Requires local Supabase and scripts/setup-local.mjs',
  );
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill('gestor@stockai.local');
  await page.getByLabel('Senha', { exact: true }).fill('Stockai.local.2026');
  await page.getByRole('button', { name: 'Entrar na operação' }).click();
  await page.waitForURL('**/operacao');
  if (await page.getByRole('heading', { name: 'Vamos organizar sua operação.' }).isVisible()) {
    await page.getByLabel('Nome da organização').fill('Stockai local');
    await page.getByLabel('Primeira unidade').fill('Cozinha de testes');
    await page.getByRole('button', { name: 'Criar operação' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Tudo sob controle.' })).toBeVisible();
  await page.getByRole('button', { name: 'Novo recebimento' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Fornecedor', { exact: true }).fill('Fornecedor de testes');
  await dialog.getByLabel('Número da nota').fill(String(Date.now()));
  await dialog.getByLabel('Insumo', { exact: true }).fill('Tomate teste');
  await dialog.getByLabel('Qtd. na nota').fill('20');
  await dialog.getByLabel('Preço unit. (R$)').fill('10');
  await dialog.getByRole('button', { name: 'Iniciar conferência' }).click();
  await expect(dialog.getByText('Conte primeiro. Compare depois.')).toBeVisible();
  await dialog.getByLabel('Quantidade de Tomate teste').fill('18');
  await dialog.getByRole('button', { name: 'Finalizar conferência' }).click();
  await expect(dialog.getByText('R$ 20,00', { exact: true })).toBeVisible();
  await expect(dialog.getByText('R$ 180,00', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Aprovar recebimento' }).click();
  await expect(dialog.getByText('Recebimento registrado')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Concluído').first()).toBeVisible();
});
