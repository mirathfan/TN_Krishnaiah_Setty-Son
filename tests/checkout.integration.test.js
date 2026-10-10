import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const runIntegration = process.env.RUN_SUPABASE_INTEGRATION === '1';
const describeLocal = runIntegration ? describe : describe.skip;
const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const checkoutUrl = `${supabaseUrl}/functions/v1/checkout`;
const origin = 'http://127.0.0.1:5173';

function makeClient(key) {
  return createClient(supabaseUrl, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

function expectSuccess(result, label) {
  expect(result.error, `${label}: ${result.error?.message || 'unexpected error'}`).toBeNull();
  return result.data;
}

function customer() {
  return {
    full_name: 'Phase 2B Local Customer',
    phone: '+91 9880226598',
    email: 'phase2b@example.test',
    address: '234 BKG Complex, Chickpet Main Road',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560053',
    notes: 'Disposable local integration test',
  };
}

function requestBody(productId, overrides = {}) {
  return {
    customer: customer(),
    items: [{ product_id: productId, quantity: 1 }],
    payment_method: 'upi',
    coupon_code: '',
    idempotency_key: randomUUID(),
    ...overrides,
  };
}

async function postCheckout(body, options = {}) {
  const response = await fetch(checkoutUrl, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
      Origin: origin,
      'x-test-client-id': options.clientId || randomUUID(),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

describeLocal('Phase 2B secure transactional checkout integration', () => {
  let serviceClient;
  let anonClient;
  let nonAdminClient;
  let nonAdminUser;
  let fixtures;
  const suffix = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const prefix = `phase2b-${suffix}`;
  const password = `Phase2B!${randomUUID()}`;

  beforeAll(async () => {
    expect(supabaseUrl).toMatch(/^http:\/\/127\.0\.0\.1:/);
    serviceClient = makeClient(serviceRoleKey);
    anonClient = makeClient(anonKey);

    const userResult = await serviceClient.auth.admin.createUser({
      email: `${prefix.replace(/[^a-z0-9]/gi, '')}@example.test`,
      password,
      email_confirm: true,
    });
    expect(userResult.error).toBeNull();
    nonAdminUser = userResult.data.user;
    nonAdminClient = makeClient(anonKey);
    expect((await nonAdminClient.auth.signInWithPassword({ email: nonAdminUser.email, password })).error).toBeNull();

    const products = expectSuccess(await serviceClient.from('products').insert([
      {
        slug: `${prefix}-standard`, title: `${prefix} standard`, sku: `${prefix}-standard`,
        price: 200, stock_status: 'in_stock', stock_quantity: 20, is_active: true,
      },
      {
        slug: `${prefix}-premium`, title: `${prefix} premium`, sku: `${prefix}-premium`,
        price: 600, stock_status: 'in_stock', stock_quantity: 20, is_active: true,
      },
      {
        slug: `${prefix}-inactive`, title: `${prefix} inactive`, sku: `${prefix}-inactive`,
        price: 100, stock_status: 'in_stock', stock_quantity: 20, is_active: false,
      },
      {
        slug: `${prefix}-empty`, title: `${prefix} empty`, sku: `${prefix}-empty`,
        price: 100, stock_status: 'out_of_stock', stock_quantity: 0, is_active: true,
      },
      {
        slug: `${prefix}-concurrent`, title: `${prefix} concurrent`, sku: `${prefix}-concurrent`,
        price: 300, stock_status: 'in_stock', stock_quantity: 1, is_active: true,
      },
      {
        slug: `${prefix}-aggregate`, title: `${prefix} aggregate`, sku: `${prefix}-aggregate`,
        price: 150, stock_status: 'in_stock', stock_quantity: 3, is_active: true,
      },
    ]).select('*'), 'create checkout products');

    const bySlug = Object.fromEntries(products.map((product) => [product.slug.split('-').at(-1), product]));
    const coupon = expectSuccess(await serviceClient.from('coupons').insert({
      code: `P2B${suffix.replace(/[^a-z0-9]/gi, '').toUpperCase()}`,
      description: prefix,
      discount_type: 'fixed',
      discount_value: 50,
      min_order_amount: 100,
      is_active: true,
    }).select('*').single(), 'create checkout coupon');
    fixtures = { ...bySlug, coupon };
  }, 90_000);

  afterAll(async () => {
    if (!serviceClient) return;
    await serviceClient.from('orders').delete().like('customer_email', 'phase2b@example.test');
    await serviceClient.from('coupons').delete().eq('description', prefix);
    await serviceClient.from('products').delete().like('slug', `${prefix}%`);
    if (nonAdminUser?.id) await serviceClient.auth.admin.deleteUser(nonAdminUser.id);
  }, 60_000);

  it('rejects forged prices/totals and leaves no order behind', async () => {
    const idempotencyKey = randomUUID();
    const body = requestBody(fixtures.standard.id, {
      idempotency_key: idempotencyKey,
      items: [{ product_id: fixtures.standard.id, quantity: 1, price: 0.01 }],
      subtotal: 0.01,
      shipping: 0,
      total: 0.01,
    });
    const { response, data } = await postCheckout(body);

    expect(response.status).toBe(400);
    expect(data.code).toMatch(/CHECKOUT_INVALID/);
    const stored = await serviceClient.from('orders').select('id').eq('idempotency_key', idempotencyKey);
    expectSuccess(stored, 'check forged request rollback');
    expect(stored.data).toHaveLength(0);
  });

  it('rejects missing, inactive, and out-of-stock products safely', async () => {
    const cases = [
      [randomUUID(), 'CHECKOUT_PRODUCT_UNAVAILABLE'],
      [fixtures.inactive.id, 'CHECKOUT_PRODUCT_UNAVAILABLE'],
      [fixtures.empty.id, 'CHECKOUT_OUT_OF_STOCK'],
    ];
    for (const [productId, expectedCode] of cases) {
      const { response, data } = await postCheckout(requestBody(productId));
      expect(response.status).toBe(409);
      expect(data.code).toBe(expectedCode);
      expect(JSON.stringify(data)).not.toContain(customer().phone);
    }
  });

  it('calculates prices, paid shipping, coupon discounts, and totals on the server', async () => {
    const { response, data } = await postCheckout(requestBody(fixtures.standard.id, {
      coupon_code: fixtures.coupon.code.toLowerCase(),
      items: [{ product_id: fixtures.standard.id, quantity: 2 }],
    }));

    expect(response.status).toBe(201);
    expect(data).toMatchObject({ subtotal: 400, shipping_fee: 60, discount: 50, total: 410, duplicate: false });
    expect(data.items[0]).toMatchObject({ product_id: fixtures.standard.id, price: 200, quantity: 2, line_total: 400 });
  });

  it('applies free shipping at the server threshold and rejects invalid coupons', async () => {
    const freeShipping = await postCheckout(requestBody(fixtures.premium.id));
    expect(freeShipping.response.status).toBe(201);
    expect(freeShipping.data).toMatchObject({ subtotal: 600, shipping_fee: 0, discount: 0, total: 600 });

    const invalidCoupon = await postCheckout(requestBody(fixtures.standard.id, { coupon_code: 'NOT-A-COUPON' }));
    expect(invalidCoupon.response.status).toBe(422);
    expect(invalidCoupon.data.code).toBe('CHECKOUT_INVALID_COUPON');
  });

  it('returns one order for concurrent duplicate requests and rejects key reuse with different input', async () => {
    const body = requestBody(fixtures.standard.id);
    const clientId = randomUUID();
    const results = await Promise.all([
      postCheckout(body, { clientId }),
      postCheckout(body, { clientId }),
    ]);
    expect(results.map(({ response }) => response.status).sort()).toEqual([200, 201]);
    expect(new Set(results.map(({ data }) => data.id)).size).toBe(1);
    expect(results.some(({ data }) => data.duplicate === true)).toBe(true);

    const changed = await postCheckout({
      ...body,
      items: [{ product_id: fixtures.standard.id, quantity: 2 }],
    }, { clientId });
    expect(changed.response.status).toBe(409);
    expect(changed.data.code).toBe('CHECKOUT_IDEMPOTENCY_CONFLICT');

    const stored = expectSuccess(await serviceClient.from('orders').select('id').eq('idempotency_key', body.idempotency_key), 'read idempotent order');
    expect(stored).toHaveLength(1);
  });

  it('denies direct checkout and inventory RPC access to anonymous and ordinary authenticated clients', async () => {
    const rpcArguments = {
      p_payload: { customer: customer(), items: [], payment_method: 'upi', coupon_code: '' },
      p_idempotency_key: randomUUID(),
      p_request_fingerprint: 'a'.repeat(64),
    };
    for (const client of [anonClient, nonAdminClient]) {
      expect((await client.rpc('create_checkout_order', rpcArguments)).error).toBeTruthy();
      expect((await client.rpc('confirm_order_inventory', { p_order_id: randomUUID() })).error).toBeTruthy();
    }
  });

  it('does not expose customer data in responses or through public database reads', async () => {
    const { response, data } = await postCheckout(requestBody(fixtures.standard.id));
    expect(response.status).toBe(201);
    const serialized = JSON.stringify(data);
    for (const privateValue of Object.values(customer())) {
      expect(serialized).not.toContain(privateValue);
    }
    const publicRead = await anonClient.from('orders').select('*').eq('id', data.id);
    expect(Boolean(publicRead.error) || publicRead.data.length === 0).toBe(true);
  });

  it('keeps requests unreserved, then commits inventory once without overselling', async () => {
    const [first, second] = await Promise.all([
      postCheckout(requestBody(fixtures.concurrent.id)),
      postCheckout(requestBody(fixtures.concurrent.id)),
    ]);
    expect(first.response.status).toBe(201);
    expect(second.response.status).toBe(201);

    const beforeConfirmation = expectSuccess(
      await serviceClient.from('products').select('stock_quantity').eq('id', fixtures.concurrent.id).single(),
      'read stock before confirmation',
    );
    expect(beforeConfirmation.stock_quantity).toBe(1);

    const confirmations = await Promise.all([
      serviceClient.rpc('confirm_order_inventory', { p_order_id: first.data.id }),
      serviceClient.rpc('confirm_order_inventory', { p_order_id: second.data.id }),
    ]);
    expect(confirmations.filter((result) => !result.error)).toHaveLength(1);
    expect(confirmations.filter((result) => result.error)).toHaveLength(1);
    expect(confirmations.find((result) => result.error)?.error.message).toContain('CHECKOUT_OUT_OF_STOCK');

    const afterConfirmation = expectSuccess(
      await serviceClient.from('products').select('stock_quantity, stock_status').eq('id', fixtures.concurrent.id).single(),
      'read stock after confirmation',
    );
    expect(afterConfirmation).toMatchObject({ stock_quantity: 0, stock_status: 'out_of_stock' });

    const orders = expectSuccess(
      await serviceClient.from('orders').select('inventory_committed_at').in('id', [first.data.id, second.data.id]),
      'read confirmed orders',
    );
    expect(orders.filter((order) => order.inventory_committed_at)).toHaveLength(1);
  });

  it('aggregates duplicate legacy line items before committing inventory', async () => {
    const order = expectSuccess(await serviceClient.from('orders').insert({
      order_number: `TNK-P2B-LEGACY-${randomUUID()}`,
      customer_name: 'Phase 2B Local Customer',
      customer_phone: '+91 9880226598',
      customer_email: 'phase2b@example.test',
      delivery_address: '234 BKG Complex, Chickpet Main Road',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560053',
      subtotal: 300,
      shipping_fee: 60,
      discount: 0,
      total: 360,
      payment_method: 'upi',
      order_status: 'pending_confirmation',
    }).select('*').single(), 'create legacy duplicate-line order');
    expectSuccess(await serviceClient.from('order_items').insert([
      {
        order_id: order.id, product_id: fixtures.aggregate.id, title_snapshot: fixtures.aggregate.title,
        price_snapshot: 150, quantity: 1, line_total: 150,
      },
      {
        order_id: order.id, product_id: fixtures.aggregate.id, title_snapshot: fixtures.aggregate.title,
        price_snapshot: 150, quantity: 1, line_total: 150,
      },
    ]).select('id'), 'create duplicate legacy lines');

    expectSuccess(
      await serviceClient.rpc('confirm_order_inventory', { p_order_id: order.id }),
      'confirm duplicate-line legacy order',
    );
    const product = expectSuccess(
      await serviceClient.from('products').select('stock_quantity').eq('id', fixtures.aggregate.id).single(),
      'read aggregate stock',
    );
    expect(product.stock_quantity).toBe(1);
  });

  it('rate limits repeated attempts and returns safe structured errors', async () => {
    const clientId = `rate-${randomUUID()}`;
    const responses = [];
    for (let index = 0; index < 6; index += 1) {
      responses.push(await postCheckout('{invalid-json', { clientId }));
    }
    expect(responses.slice(0, 5).every(({ response }) => response.status === 400)).toBe(true);
    expect(responses[5].response.status).toBe(429);
    expect(responses[5].data).toMatchObject({ code: 'CHECKOUT_RATE_LIMITED', retryable: true });
    expect(responses[5].response.headers.get('retry-after')).toBeTruthy();
    expect(JSON.stringify(responses[5].data)).not.toContain(customer().phone);
  });

  it('rejects oversized requests and unsupported methods without processing an order', async () => {
    const oversized = await postCheckout(JSON.stringify({ padding: 'x'.repeat(17 * 1024) }));
    expect(oversized.response.status).toBe(413);
    expect(oversized.data.code).toBe('CHECKOUT_REQUEST_TOO_LARGE');

    const getResponse = await fetch(checkoutUrl, { method: 'GET', headers: { apikey: anonKey, Origin: origin } });
    expect(getResponse.status).toBe(405);
    expect((await getResponse.json()).code).toBe('CHECKOUT_METHOD_NOT_ALLOWED');
  });
});
