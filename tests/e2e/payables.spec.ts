import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
test('database: payables include expenses without CNPJ and pending XML', async ({ page }) => {
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
  const createdUser = await response.json();
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
  await page.getByRole('link', { name: 'Contas a pagar', exact: true }).click();
  await page.getByRole('button', { name: 'Nova despesa' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Favorecido (sem CNPJ obrigatório)').fill('Prestador sem documento');
  await modal.getByLabel('Descrição', { exact: true }).fill('Manutenção da cozinha');
  await modal.getByLabel('Valor da parcela 1').fill('150,50');
  await modal.getByRole('button', { name: 'Salvar conta', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Conta salva');
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toContainText('R$ 150,50');
  await expect(page.getByRole('article')).toContainText('Sem vencimento');
  await page.getByRole('button', { name: 'Abrir conta' }).click();
  await modal.getByLabel('Vencimento da parcela 1').fill('2026-09-01');
  await modal.getByLabel('Pagamento da parcela 1').fill('2026-09-01');
  await modal.getByRole('button', { name: 'Salvar conta', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await page.getByLabel('Situação', { exact: true }).selectOption('paid');
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toContainText('Paga');
  await page.getByRole('button', { name: 'Abrir conta' }).click();
  await modal.getByRole('link', { name: 'Ver histórico de alterações' }).click();
  await expect(page.getByRole('heading', { name: 'Histórico de alterações' })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(2);
  await page.goto('/fornecedores');
  await expect(
    page.getByRole('article').filter({ hasText: 'Prestador sem documento' }),
  ).toBeVisible();
  await page.goto('/operacao');
  await page.getByRole('button', { name: 'Importar XML', exact: true }).click();
  await page.getByLabel('Arquivo XML da NF-e').setInputFiles('tests/fixtures/nfe.xml');
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Envio concluído');
  await page.goto('/contas-a-pagar');
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toContainText('R$ 190,00');
  await expect(
    page.getByRole('article').getByRole('link', { name: 'Produtos aguardando identificação' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Abrir conta' }).click();
  await expect(modal.getByLabel('Valor da parcela 1')).toHaveValue('190.00');
  await modal.getByLabel('Valor da parcela 1').fill('100.00');
  await modal.getByRole('button', { name: 'Salvar conta', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('soma das parcelas');
  await modal.getByLabel('Valor da parcela 1').fill('190.00');
  await modal.getByRole('button', { name: 'Salvar conta', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await page.screenshot({ path: '/tmp/stockai-payables-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/stockai-payables-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Abrir conta' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/stockai-payables-edit-mobile.png', fullPage: true });
  await modal.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByLabel('Situação', { exact: true }).selectOption('paid');
  await page.getByLabel('Mês das contas').selectOption('2026-09');
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('button', { name: 'Abrir conta' }).click();
  await modal.getByLabel('Parcela 1 paga sem data').check();
  await modal.getByRole('button', { name: 'Salvar conta', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await page.getByText('Parcelas e vencimentos', { exact: true }).click();
  await expect(page.getByRole('article')).toContainText('Paga (data não informada)');
  // Seed one unresolved import in the local database only.
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
  const members = await (
    await fetch(`${url}/rest/v1/stockai_memberships?user_id=eq.${createdUser.id}&select=org_id`, {
      headers,
    })
  ).json();
  const orgId = members[0].org_id;
  const seeded = await fetch(`${url}/rest/v1/stockai_payable_import_rows`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      org_id: orgId,
      source_fingerprint: `e2e-${Date.now()}`,
      file_name: 'contas-teste.xlsx',
      sheet_name: 'AGOSTO',
      row_number: 2,
      source_data: { supplier: 'Patrimonial teste', amount: 42 },
      proposed_data: {
        creditor_name: 'Patrimonial teste',
        description: 'Serviço pendente',
        reference_month: '2026-08',
        installments: [{ amount_cents: 4200, due_on: '2026-08-10' }],
      },
      reason: 'Identificar a empresa',
    }),
  });
  expect(seeded.ok).toBeTruthy();
  await page.reload();
  await page.getByRole('button', { name: 'Despesas sem identificação (1)' }).click();
  await page.getByLabel('Mês das contas').selectOption('2026-08');
  await expect(page.getByRole('button', { name: 'Identificar despesa', exact: true })).toHaveCount(
    1,
  );
  await page.getByLabel('Mês das contas').selectOption('missing');
  await expect(page.getByRole('button', { name: 'Identificar despesa', exact: true })).toHaveCount(
    0,
  );
  await page.getByLabel('Mês das contas').selectOption('2026-08');
  await page.getByRole('button', { name: 'Identificar despesa', exact: true }).click();
  await modal.getByLabel('Empresa', { exact: true }).selectOption({ label: 'Empresa Centro' });
  await modal.getByRole('button', { name: 'Identificar e lançar' }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Despesas sem identificação (0)' })).toBeVisible();
  const stagedRows = await (
    await fetch(
      `${url}/rest/v1/stockai_payable_import_rows?org_id=eq.${orgId}&select=id,payable_id`,
      { headers },
    )
  ).json();
  const heldId = stagedRows[0].payable_id;
  expect(
    (
      await fetch(`${url}/rest/v1/stockai_payables?id=eq.${heldId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ on_hold: true }),
      })
    ).ok,
  ).toBeTruthy();
  expect(
    (
      await fetch(`${url}/rest/v1/stockai_payable_import_rows?id=eq.${stagedRows[0].id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ state: 'pending' }),
      })
    ).ok,
  ).toBeTruthy();
  await page.reload();
  await page.getByRole('button', { name: 'Despesas sem identificação (1)' }).click();
  await page.getByRole('button', { name: 'Identificar despesa', exact: true }).click();
  await modal.getByRole('button', { name: 'Identificar e lançar' }).click();
  await expect(modal).not.toBeVisible();
  const resumed = await (
    await fetch(
      `${url}/rest/v1/stockai_payable_import_rows?id=eq.${stagedRows[0].id}&select=payable_id`,
      { headers },
    )
  ).json();
  expect(resumed[0].payable_id).toBe(heldId);
  await page.getByRole('button', { name: 'Contas a pagar', exact: true }).click();
  await page.getByLabel('Mês das contas').selectOption('2026-08');
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toContainText('Patrimonial teste');
  await page.screenshot({ path: '/tmp/stockai-payables-month.png', fullPage: true });
  const inbox = await (
    await fetch(`${url}/rest/v1/stockai_xml_inbox?org_id=eq.${orgId}&select=id`, { headers })
  ).json();
  const identified = await page.request.post('/api/xml-inbox', {
    headers: { origin: new URL(page.url()).origin },
    data: { action: 'identify', id: inbox[0].id, createMissing: true },
  });
  expect(identified.ok()).toBeTruthy();
  await page.reload();
  await page.getByLabel('Situação', { exact: true }).selectOption('all');
  await page.getByRole('button', { name: 'Nova despesa' }).click();
  await modal.getByLabel('Favorecido (sem CNPJ obrigatório)').fill('Fornecedor XML Teste');
  await modal.getByLabel('Descrição', { exact: true }).fill('Cobrança da nota 123');
  await modal.getByLabel('Valor da parcela 1').fill('190.00');
  await modal.getByLabel('Vencimento da parcela 1').fill('2026-08-25');
  await modal.getByRole('button', { name: 'Salvar conta', exact: true }).click();
  await expect(modal).not.toBeVisible();
  const expense = page.getByRole('article').filter({ hasText: 'Cobrança da nota 123' });
  await expense.getByRole('button', { name: 'Abrir conta' }).click();
  const option = modal
    .getByLabel('Nota para vincular')
    .locator('option')
    .filter({ hasText: 'NF 123' });
  await modal
    .getByLabel('Nota para vincular')
    .selectOption((await option.getAttribute('value')) || '');
  await modal.getByRole('button', { name: 'Vincular e unificar conta' }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(page.getByRole('status')).toContainText('Conta unificada');
});
