import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
test('database: internal codes, categories and CMV persist through edits', async ({ page }) => {
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
  const user = await response.json();
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
  await page.getByLabel('Código interno').fill('PAP-01');
  await page.getByLabel('Compõe CMV?', { exact: true }).selectOption('false');
  await page.getByRole('button', { name: 'Salvar produto', exact: true }).click();
  await expect(page.getByRole('article').filter({ hasText: 'Papel toalha' })).toContainText(
    'Compõe CMV: Não',
  );
  await page.getByRole('button', { name: 'Editar produto Papel toalha', exact: true }).click();
  await page.getByLabel('Categoria do produto').selectOption({ label: 'Alimentos' });
  await page.getByLabel('Compõe CMV?', { exact: true }).selectOption('true');
  await page.getByLabel('Código interno').fill('PAP-02');
  await page.getByRole('button', { name: 'Salvar produto', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('article').filter({ hasText: 'Papel toalha' })).toContainText(
    'PAP-02',
  );
  await page.getByLabel('Filtrar CMV').selectOption('false');
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.getByLabel('Filtrar CMV').selectOption('all');
  await page.getByText('Categorias cadastradas (1)', { exact: true }).click();
  await page.getByRole('button', { name: 'Editar categoria Alimentos', exact: true }).click();
  await page.getByLabel('Nome da categoria').fill('Alimentos e bebidas');
  await page.getByRole('button', { name: 'Salvar categoria', exact: true }).click();
  await expect(page.getByRole('article').filter({ hasText: 'Papel toalha' })).toContainText(
    'Alimentos e bebidas',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
  async function api(path: string, body?: unknown) {
    const r = await fetch(`${url}/rest/v1/${path}`, {
      method: body ? 'POST' : 'GET',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    expect(r.ok, await r.clone().text()).toBeTruthy();
    return r.json();
  }
  const [membership] = await api(`stockai_memberships?user_id=eq.${user.id}&select=org_id`);
  const [original] = await api(
    `stockai_items?org_id=eq.${membership.org_id}&internal_code=eq.PAP-02`,
  );
  const [target] = await api('stockai_items', {
    org_id: membership.org_id,
    name: 'Papel toalhas',
    internal_code: 'PAP-03',
    base_uom: 'UN',
    composes_cmv: false,
  });
  const [link] = await api('stockai_product_links', {
    org_id: membership.org_id,
    supplier_tax_id: '12345678000195',
    supplier_code: 'FORN-PAP',
    updated_by: user.id,
    source_unit: 'UN',
    item_id: original.id,
    factor: 1,
  });
  await page.reload();
  await page.getByRole('button', { name: 'Nomes parecidos', exact: true }).click();
  const card = page.getByRole('article', { name: 'Papel toalha', exact: true });
  await expect(card).toBeVisible();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `similar products at ${width}px`,
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await card.getByRole('button', { name: 'Corrigir nome' }).click();
  await card.getByLabel('Nosso nome do produto').fill('Papel toalha folha');
  await card.getByRole('button', { name: 'Salvar nome', exact: true }).click();
  const renamed = page.getByRole('article', { name: 'Papel toalha folha', exact: true });
  await expect(renamed).toBeVisible();
  await renamed.getByRole('button', { name: 'Vincular a PAP-03', exact: true }).click();
  await expect(renamed.getByLabel('Código do fornecedor a vincular')).toHaveValue(link.id);
  await expect(
    renamed.getByRole('combobox', { name: 'Produto existente', exact: true }),
  ).toHaveValue(target.id);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/stockai-similar-mobile.png', fullPage: true });
  await renamed.getByRole('button', { name: 'Salvar vínculo', exact: true }).click();
  await expect(renamed.getByRole('status')).toContainText('Vínculo salvo');
  const [savedLink] = await api(`stockai_product_links?id=eq.${link.id}`);
  expect(savedLink.item_id).toBe(target.id);
  const targetCard = page.getByRole('article', { name: 'Papel toalhas', exact: true });
  await targetCard.getByLabel('Código interno do produto').fill('pap-02');
  await targetCard.getByRole('button', { name: 'Salvar código', exact: true }).click();
  await expect(targetCard.getByRole('status')).toContainText('transferido(s) para PAP-02');
  const [automaticLink] = await api(`stockai_product_links?id=eq.${link.id}`);
  expect(automaticLink.item_id).toBe(original.id);
  const [savedItem] = await api(`stockai_items?id=eq.${original.id}`);
  expect(savedItem.name).toBe('Papel toalha folha');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: '/tmp/stockai-similar-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.mobile-navigation summary').click();
  await expect(page.getByRole('navigation', { name: 'Menu móvel' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Menu móvel' })
    .getByRole('link', { name: 'Pedidos', exact: true })
    .click();
  await expect(page).toHaveURL(/\/pedidos$/);
  for (const route of [
    '/operacao',
    '/empresas',
    '/fornecedores',
    '/devolucoes',
    '/identificacao',
    '/pedidos',
    '/entregas',
    '/contas-a-pagar',
    `/produtos/${target.id}`,
  ]) {
    await page.goto(route);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect
        .soft(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${route} at ${width}px`,
        )
        .toBe(true);
    }
  }
});
