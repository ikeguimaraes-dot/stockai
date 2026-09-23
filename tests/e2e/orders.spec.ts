import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
test('database: kitchen request, partial dispatch and durable signed delivery', async ({
  page,
}) => {
  test.skip(!process.env.STOCKAI_TEST_DATABASE, 'Local database only');
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configured || !['localhost', '127.0.0.1'].includes(new URL(configured).hostname))
    throw new Error('Local database only');
  const status = JSON.parse(
    execFileSync('supabase', ['status', '--output', 'json'], { encoding: 'utf8' }),
  );
  const url = status.API_URL;
  if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname))
    throw new Error('Local database only');
  const email = `orders-${Date.now()}@stockai.local`,
    password = 'Orders.local.2026';
  const admin = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: status.SERVICE_ROLE_KEY,
      Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  expect(admin.ok).toBeTruthy();
  const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: status.ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const token = (await login.json()).access_token;
  const headers = {
    apikey: status.ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  async function rpc(name: string, data: object) {
    const r = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    expect(r.ok, await r.clone().text()).toBeTruthy();
    return r.status === 204 ? null : r.json();
  }
  const source = await rpc('stockai_register_company', {
    p_name: 'Estoque Central',
    p_legal_name: 'Estoque Central Ltda',
    p_tax_id: '12345678000195',
  });
  const unitRes = await fetch(`${url}/rest/v1/stockai_units?id=eq.${source}&select=org_id`, {
    headers,
  });
  const org = (await unitRes.json())[0].org_id;
  const destination = await rpc('stockai_register_company', {
    p_name: 'Restaurante Jardins',
    p_legal_name: 'Jardins Ltda',
    p_tax_id: '11222333000181',
    p_org: org,
  });
  const receipt = await rpc('stockai_create_receipt', {
    p_unit: source,
    p_supplier: 'Fornecedor Teste',
    p_invoice: 'orders-1',
    p_request: crypto.randomUUID(),
    p_lines: [{ name: 'Arroz', uom: 'KG', quantity: 20, price_cents: 500 }],
  });
  const lines = await (
    await fetch(`${url}/rest/v1/stockai_receipt_lines?receipt_id=eq.${receipt}&select=id`, {
      headers,
    })
  ).json();
  await rpc('stockai_submit_receipt_count', {
    p_receipt: receipt,
    p_counts: { [lines[0].id]: 20 },
  });
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar na operação' }).click();
  await page.getByRole('link', { name: 'Pedidos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pedidos das cozinhas' })).toBeVisible();
  await page.getByRole('button', { name: 'Novo pedido', exact: true }).click();
  await page.getByLabel('Restaurante solicitante').selectOption(destination);
  await page.getByLabel('Estoque de origem', { exact: true }).selectOption(source);
  await page.getByLabel('Cozinha / setor').fill('Cozinha quente');
  await page.getByLabel('Produto 1', { exact: true }).selectOption({ label: 'Arroz · KG' });
  await page.getByLabel('Quantidade 1', { exact: true }).fill('8');
  await page.getByRole('button', { name: 'Enviar pedido', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Pedido enviado');
  await page.getByRole('button').filter({ hasText: 'Abrir pedido' }).click();
  await page.getByLabel('Separar Arroz').fill('7');
  await page.getByRole('button', { name: 'Expedir pedido', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Pedido expedido');
  await page.getByRole('link', { name: 'Entregas', exact: true }).first().click();
  await page.getByRole('button').filter({ hasText: 'Abrir pedido' }).click();
  await expect(page.getByRole('heading', { name: 'Confirmação de recebimento' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Nome de quem recebeu').fill('Maria da Cozinha');
  const pad = page.getByRole('img', { name: 'Campo para desenhar assinatura' });
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + 120, { steps: 20 });
  await page.mouse.move(box.x + box.width * 0.8, box.y + 60, { steps: 12 });
  await page.mouse.up();
  await page.getByLabel('Conferi e recebi as quantidades expedidas deste pedido.').check();
  await page.getByRole('button', { name: 'Assinar e confirmar entrega' }).click();
  await expect(page.getByRole('status')).toContainText('Entrega assinada');
  await expect(page.getByRole('heading', { name: 'Comprovante de recebimento' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: '/tmp/stockai-order-signed-mobile.png', fullPage: true });
  await page.reload();
  await page.getByLabel('Situação', { exact: true }).selectOption('delivered');
  await page.getByRole('button').filter({ hasText: 'Ver comprovante' }).click();
  await expect(page.getByText('Maria da Cozinha', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Assinatura de quem recebeu' }).locator('polyline'),
  ).toHaveCount(1);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: '/tmp/stockai-order-signed-desktop.png', fullPage: true });
  const balances = await rpc('stockai_stock_balances', {});
  expect(balances.find((b: { unit_id: string }) => b.unit_id === source).quantity).toBe(13);
  expect(balances.find((b: { unit_id: string }) => b.unit_id === destination).quantity).toBe(7);
  await page.getByRole('link', { name: 'Voltar à operação' }).click();
  await page.getByRole('button', { name: 'Estoque', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saldo em estoque' })).toBeVisible();
  // Competing dispatches must serialize on the source/product balance.
  const products = await (
    await fetch(`${url}/rest/v1/stockai_items?org_id=eq.${org}&select=id`, { headers })
  ).json();
  const competing = await Promise.all(
    [1, 2].map(() =>
      rpc('stockai_create_order', {
        p_source: source,
        p_destination: destination,
        p_kitchen: 'Cozinha concorrente',
        p_notes: '',
        p_needed: new Date().toISOString().slice(0, 10),
        p_request: crypto.randomUUID(),
        p_lines: [{ item_id: products[0].id, quantity: 10 }],
      }),
    ),
  );
  const payloads = await Promise.all(
    competing.map(async (order) => {
      const result = await fetch(
        `${url}/rest/v1/stockai_order_lines?order_id=eq.${order}&select=id`,
        { headers },
      );
      const rows = await result.json();
      return { p_order: order, p_lines: [{ id: rows[0].id, quantity: 10 }] };
    }),
  );
  const dispatched = await Promise.all(
    payloads.map((body) =>
      fetch(`${url}/rest/v1/rpc/stockai_dispatch_order`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }),
    ),
  );
  expect(dispatched.filter((r) => r.ok)).toHaveLength(1);
  expect(dispatched.filter((r) => !r.ok)).toHaveLength(1);
  const afterRace = await rpc('stockai_stock_balances', {});
  expect(afterRace.find((b: { unit_id: string }) => b.unit_id === source).quantity).toBe(3);
});
