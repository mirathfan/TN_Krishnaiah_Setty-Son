import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAuthorizedAdminUser } from '../src/services/adminAuthorization';

const runIntegration = process.env.RUN_SUPABASE_INTEGRATION === '1';
const describeLocal = runIntegration ? describe : describe.skip;

const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = 'product-images';

function makeClient(key) {
  return createClient(supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function expectSuccess(result, label) {
  expect(result.error, `${label}: ${result.error?.message || 'unexpected error'}`).toBeNull();
  return result.data;
}

function expectBlocked(result, label) {
  const returnedRows = Array.isArray(result.data) ? result.data.length : 0;
  expect(Boolean(result.error) || returnedRows === 0, `${label} unexpectedly changed a row`).toBe(true);
}

describeLocal('Phase 2A Supabase authorization integration', () => {
  let serviceClient;
  let anonClient;
  let adminClient;
  let nonAdminClient;
  let adminUser;
  let nonAdminUser;
  let fixtures;
  let storagePath;

  const suffix = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const emailSuffix = suffix.replace(/[^a-z0-9]/gi, '');
  const password = `Phase2A!${randomUUID()}`;
  const testPrefix = `phase2a-${suffix}`;

  beforeAll(async () => {
    expect(supabaseUrl).toMatch(/^http:\/\/127\.0\.0\.1:/);
    expect(anonKey).toBeTruthy();
    expect(serviceRoleKey).toBeTruthy();

    serviceClient = makeClient(serviceRoleKey);
    anonClient = makeClient(anonKey);

    const adminCreate = await serviceClient.auth.admin.createUser({
      email: `phase2a-admin-${emailSuffix}@example.test`,
      password,
      email_confirm: true,
    });
    expect(adminCreate.error).toBeNull();
    adminUser = adminCreate.data.user;

    const nonAdminCreate = await serviceClient.auth.admin.createUser({
      email: `phase2a-user-${emailSuffix}@example.test`,
      password,
      email_confirm: true,
    });
    expect(nonAdminCreate.error).toBeNull();
    nonAdminUser = nonAdminCreate.data.user;

    expectSuccess(
      await serviceClient.from('admin_users').insert({ user_id: adminUser.id }).select('user_id'),
      'provision local test admin',
    );

    adminClient = makeClient(anonKey);
    nonAdminClient = makeClient(anonKey);

    const adminSignIn = await adminClient.auth.signInWithPassword({
      email: adminUser.email,
      password,
    });
    expect(adminSignIn.error).toBeNull();

    const nonAdminSignIn = await nonAdminClient.auth.signInWithPassword({
      email: nonAdminUser.email,
      password,
    });
    expect(nonAdminSignIn.error).toBeNull();

    const categories = expectSuccess(
      await serviceClient
        .from('categories')
        .insert([
          { name: `${testPrefix} active`, slug: `${testPrefix}-active`, is_active: true },
          { name: `${testPrefix} inactive`, slug: `${testPrefix}-inactive`, is_active: false },
        ])
        .select('*'),
      'create category fixtures',
    );

    const activeCategory = categories.find((row) => row.is_active);
    const inactiveCategory = categories.find((row) => !row.is_active);

    const products = expectSuccess(
      await serviceClient
        .from('products')
        .insert([
          {
            slug: `${testPrefix}-active-book`,
            title: `${testPrefix} active book`,
            category_id: activeCategory.id,
            price: 100,
            stock_quantity: 2,
            is_active: true,
          },
          {
            slug: `${testPrefix}-inactive-book`,
            title: `${testPrefix} inactive book`,
            category_id: inactiveCategory.id,
            price: 120,
            stock_quantity: 1,
            is_active: false,
          },
        ])
        .select('*'),
      'create product fixtures',
    );

    const activeProduct = products.find((row) => row.is_active);
    const inactiveProduct = products.find((row) => !row.is_active);

    const reviews = expectSuccess(
      await serviceClient
        .from('customer_reviews')
        .insert([
          {
            product_id: activeProduct.id,
            customer_name: `${testPrefix} approved reviewer`,
            rating: 5,
            review_text: 'Approved local test review',
            is_approved: true,
          },
          {
            product_id: activeProduct.id,
            customer_name: `${testPrefix} pending reviewer`,
            rating: 4,
            review_text: 'Pending local test review',
            is_approved: false,
          },
        ])
        .select('*'),
      'create review fixtures',
    );

    const coupon = expectSuccess(
      await serviceClient
        .from('coupons')
        .insert({
          code: `P2A${emailSuffix.toUpperCase()}`,
          description: testPrefix,
          discount_type: 'fixed',
          discount_value: 10,
        })
        .select('*')
        .single(),
      'create coupon fixture',
    );

    const order = expectSuccess(
      await serviceClient
        .from('orders')
        .insert({
          order_number: `TNK-P2A-${emailSuffix.toUpperCase()}`,
          customer_name: `${testPrefix} customer`,
          customer_phone: '+910000000000',
          customer_email: 'local-test@example.test',
          delivery_address: 'Local integration test only',
          city: 'Bangalore',
          state: 'Karnataka',
          pincode: '560053',
          subtotal: 100,
          shipping_fee: 0,
          discount: 0,
          total: 100,
          payment_method: 'test',
        })
        .select('*')
        .single(),
      'create order fixture',
    );

    const orderItem = expectSuccess(
      await serviceClient
        .from('order_items')
        .insert({
          order_id: order.id,
          product_id: activeProduct.id,
          title_snapshot: `${testPrefix} book`,
          price_snapshot: 100,
          quantity: 1,
          line_total: 100,
        })
        .select('*')
        .single(),
      'create order item fixture',
    );

    fixtures = {
      categories: activeCategory,
      inactiveCategory,
      products: activeProduct,
      inactiveProduct,
      customer_reviews: reviews.find((row) => row.is_approved),
      pendingReview: reviews.find((row) => !row.is_approved),
      coupons: coupon,
      orders: order,
      order_items: orderItem,
    };
  }, 60_000);

  afterAll(async () => {
    if (!serviceClient) return;

    if (storagePath) {
      await serviceClient.storage.from(bucket).remove([storagePath]);
    }

    await serviceClient.from('orders').delete().like('order_number', 'TNK-P2A-%');
    await serviceClient.from('customer_reviews').delete().like('customer_name', `${testPrefix}%`);
    await serviceClient.from('products').delete().like('slug', `${testPrefix}%`);
    await serviceClient.from('categories').delete().like('slug', `${testPrefix}%`);
    await serviceClient.from('coupons').delete().like('description', `${testPrefix}%`);

    if (adminUser?.id) await serviceClient.auth.admin.deleteUser(adminUser.id);
    if (nonAdminUser?.id) await serviceClient.auth.admin.deleteUser(nonAdminUser.id);
  }, 60_000);

  it('disables public registration and verifies Auth plus allowlist membership', async () => {
    const registrationClient = makeClient(anonKey);
    const registration = await registrationClient.auth.signUp({
      email: `phase2a-signup-${emailSuffix}@example.test`,
      password,
    });
    expect(registration.error).toBeTruthy();

    await expect(getAuthorizedAdminUser(adminClient)).resolves.toMatchObject({ id: adminUser.id });
    await expect(getAuthorizedAdminUser(nonAdminClient)).resolves.toBeNull();
    await expect(getAuthorizedAdminUser(anonClient)).resolves.toBeNull();
  });

  it('limits public catalog reads while admins can inspect all administrative data', async () => {
    for (const client of [anonClient, nonAdminClient]) {
      const categoryRead = await client
        .from('categories')
        .select('id')
        .in('id', [fixtures.categories.id, fixtures.inactiveCategory.id]);
      expectSuccess(categoryRead, 'public category read');
      expect(categoryRead.data.map((row) => row.id)).toEqual([fixtures.categories.id]);

      const productRead = await client
        .from('products')
        .select('id')
        .in('id', [fixtures.products.id, fixtures.inactiveProduct.id]);
      expectSuccess(productRead, 'public product read');
      expect(productRead.data.map((row) => row.id)).toEqual([fixtures.products.id]);

      const reviewRead = await client
        .from('customer_reviews')
        .select('id')
        .in('id', [fixtures.customer_reviews.id, fixtures.pendingReview.id]);
      expectSuccess(reviewRead, 'public review read');
      expect(reviewRead.data.map((row) => row.id)).toEqual([fixtures.customer_reviews.id]);

      for (const table of ['orders', 'order_items', 'coupons']) {
        const privateRead = await client.from(table).select('id').limit(1);
        expectBlocked(privateRead, `${table} private read`);
      }
    }

    const adminCategoryRead = await adminClient
      .from('categories')
      .select('id')
      .in('id', [fixtures.categories.id, fixtures.inactiveCategory.id]);
    expectSuccess(adminCategoryRead, 'admin category read');
    expect(adminCategoryRead.data).toHaveLength(2);

    const adminProductRead = await adminClient
      .from('products')
      .select('id')
      .in('id', [fixtures.products.id, fixtures.inactiveProduct.id]);
    expectSuccess(adminProductRead, 'admin product read');
    expect(adminProductRead.data).toHaveLength(2);

    const adminReviewRead = await adminClient
      .from('customer_reviews')
      .select('id')
      .in('id', [fixtures.customer_reviews.id, fixtures.pendingReview.id]);
    expectSuccess(adminReviewRead, 'admin review read');
    expect(adminReviewRead.data).toHaveLength(2);

    for (const table of ['orders', 'order_items', 'coupons']) {
      const privateRead = await adminClient.from(table).select('id').eq('id', fixtures[table].id);
      expectSuccess(privateRead, `admin ${table} read`);
      expect(privateRead.data).toHaveLength(1);
    }
  });

  it('denies every application-table write to anonymous and non-admin users', async () => {
    const payloads = {
      categories: { name: `${testPrefix} denied category`, slug: `${testPrefix}-denied-category` },
      products: {
        slug: `${testPrefix}-denied-product`,
        title: `${testPrefix} denied product`,
        category_id: fixtures.categories.id,
        price: 10,
      },
      customer_reviews: {
        product_id: fixtures.products.id,
        customer_name: `${testPrefix} denied review`,
        rating: 5,
      },
      coupons: {
        code: `DENIED${emailSuffix.toUpperCase()}`,
        discount_type: 'fixed',
        discount_value: 1,
      },
      orders: {
        order_number: `TNK-P2A-DENIED-${emailSuffix.toUpperCase()}`,
        customer_name: 'Denied test',
        customer_phone: '+910000000000',
        delivery_address: 'Denied local test',
        city: 'Bangalore',
        pincode: '560053',
        total: 1,
        payment_method: 'test',
      },
      order_items: {
        order_id: fixtures.orders.id,
        title_snapshot: 'Denied test item',
        price_snapshot: 1,
        quantity: 1,
        line_total: 1,
      },
    };
    const updatePatches = {
      categories: { description: 'unauthorized change' },
      products: { stock_quantity: 999 },
      customer_reviews: { is_approved: false },
      coupons: { description: 'unauthorized change' },
      orders: { order_status: 'cancelled' },
      order_items: { quantity: 2, line_total: 200 },
    };

    for (const [role, client] of [['anonymous', anonClient], ['non-admin', nonAdminClient]]) {
      for (const table of Object.keys(payloads)) {
        const insert = await client.from(table).insert(payloads[table]).select('id');
        expectBlocked(insert, `${role} ${table} insert`);

        const update = await client
          .from(table)
          .update(updatePatches[table])
          .eq('id', fixtures[table].id)
          .select('id');
        expectBlocked(update, `${role} ${table} update`);

        const deletion = await client
          .from(table)
          .delete()
          .eq('id', fixtures[table].id)
          .select('id');
        expectBlocked(deletion, `${role} ${table} delete`);
      }
    }
  });

  it('allows an allowlisted administrator to create, update, and delete every administrative record type', async () => {
    const category = expectSuccess(
      await adminClient
        .from('categories')
        .insert({ name: `${testPrefix} admin category`, slug: `${testPrefix}-admin-category` })
        .select('*')
        .single(),
      'admin category insert',
    );
    expectSuccess(
      await adminClient.from('categories').update({ description: 'updated' }).eq('id', category.id).select('id'),
      'admin category update',
    );

    const product = expectSuccess(
      await adminClient
        .from('products')
        .insert({
          slug: `${testPrefix}-admin-product`,
          title: `${testPrefix} admin product`,
          category_id: category.id,
          price: 25,
          stock_quantity: 4,
        })
        .select('*')
        .single(),
      'admin product insert',
    );
    expectSuccess(
      await adminClient.from('products').update({ stock_quantity: 3 }).eq('id', product.id).select('id'),
      'admin product update',
    );

    const review = expectSuccess(
      await adminClient
        .from('customer_reviews')
        .insert({ product_id: product.id, customer_name: `${testPrefix} admin review`, rating: 5 })
        .select('*')
        .single(),
      'admin review insert',
    );
    expectSuccess(
      await adminClient.from('customer_reviews').update({ is_approved: true }).eq('id', review.id).select('id'),
      'admin review update',
    );

    const coupon = expectSuccess(
      await adminClient
        .from('coupons')
        .insert({
          code: `ADMIN${emailSuffix.toUpperCase()}`,
          description: `${testPrefix} admin coupon`,
          discount_type: 'fixed',
          discount_value: 5,
        })
        .select('*')
        .single(),
      'admin coupon insert',
    );
    expectSuccess(
      await adminClient.from('coupons').update({ description: `${testPrefix} updated` }).eq('id', coupon.id).select('id'),
      'admin coupon update',
    );

    const order = expectSuccess(
      await adminClient
        .from('orders')
        .insert({
          order_number: `TNK-P2A-ADMIN-${emailSuffix.toUpperCase()}`,
          customer_name: 'Admin local test',
          customer_phone: '+910000000000',
          delivery_address: 'Local test only',
          city: 'Bangalore',
          pincode: '560053',
          subtotal: 25,
          total: 25,
          payment_method: 'test',
        })
        .select('*')
        .single(),
      'admin order insert',
    );
    expectSuccess(
      await adminClient.from('orders').update({ order_status: 'confirmed' }).eq('id', order.id).select('id'),
      'admin order update',
    );

    const orderItem = expectSuccess(
      await adminClient
        .from('order_items')
        .insert({
          order_id: order.id,
          product_id: product.id,
          title_snapshot: product.title,
          price_snapshot: 25,
          quantity: 1,
          line_total: 25,
        })
        .select('*')
        .single(),
      'admin order item insert',
    );
    expectSuccess(
      await adminClient.from('order_items').update({ quantity: 2, line_total: 50 }).eq('id', orderItem.id).select('id'),
      'admin order item update',
    );

    for (const [table, id] of [
      ['order_items', orderItem.id],
      ['customer_reviews', review.id],
      ['orders', order.id],
      ['products', product.id],
      ['categories', category.id],
      ['coupons', coupon.id],
    ]) {
      const deletion = await adminClient.from(table).delete().eq('id', id).select('id');
      expectSuccess(deletion, `admin ${table} delete`);
      expect(deletion.data).toHaveLength(1);
    }
  });

  it('keeps the allowlist server-managed for every browser role', async () => {
    const clients = [anonClient, nonAdminClient, adminClient];

    const anonMembership = await anonClient.from('admin_users').select('user_id');
    expectBlocked(anonMembership, 'anonymous allowlist read');

    const nonAdminMembership = await nonAdminClient.from('admin_users').select('user_id');
    expectSuccess(nonAdminMembership, 'non-admin own allowlist read');
    expect(nonAdminMembership.data).toEqual([]);

    const adminMembership = await adminClient.from('admin_users').select('user_id');
    expectSuccess(adminMembership, 'admin own allowlist read');
    expect(adminMembership.data).toEqual([{ user_id: adminUser.id }]);

    for (const [index, client] of clients.entries()) {
      expectBlocked(
        await client.from('admin_users').insert({ user_id: nonAdminUser.id }).select('user_id'),
        `role ${index} allowlist insert`,
      );
      expectBlocked(
        await client
          .from('admin_users')
          .update({ created_by: nonAdminUser.id })
          .eq('user_id', adminUser.id)
          .select('user_id'),
        `role ${index} allowlist update`,
      );
      expectBlocked(
        await client.from('admin_users').delete().eq('user_id', adminUser.id).select('user_id'),
        `role ${index} allowlist delete`,
      );
    }

    await expect(getAuthorizedAdminUser(adminClient)).resolves.toMatchObject({ id: adminUser.id });
  });

  it('allows public image downloads but reserves Storage list and writes for administrators', async () => {
    const folder = `products/${testPrefix}`;
    storagePath = `${folder}/cover.png`;
    const fileBytes = Uint8Array.from([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
      0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
    ]);

    const anonUpload = await anonClient.storage.from(bucket).upload(`${folder}/anon.png`, fileBytes, {
      contentType: 'image/png',
    });
    expect(anonUpload.error).toBeTruthy();

    const nonAdminUpload = await nonAdminClient.storage.from(bucket).upload(`${folder}/user.png`, fileBytes, {
      contentType: 'image/png',
    });
    expect(nonAdminUpload.error).toBeTruthy();

    const adminUpload = await adminClient.storage.from(bucket).upload(storagePath, fileBytes, {
      contentType: 'image/png',
    });
    expect(adminUpload.error).toBeNull();

    const { data: publicUrlData } = anonClient.storage.from(bucket).getPublicUrl(storagePath);
    const publicDownload = await fetch(publicUrlData.publicUrl);
    expect(publicDownload.status).toBe(200);

    for (const client of [anonClient, nonAdminClient]) {
      const listing = await client.storage.from(bucket).list(folder);
      const names = listing.data?.map((item) => item.name) || [];
      expect(Boolean(listing.error) || !names.includes('cover.png')).toBe(true);

      const update = await client.storage.from(bucket).update(storagePath, fileBytes, {
        contentType: 'image/png',
        upsert: true,
      });
      expect(update.error).toBeTruthy();

      const removal = await client.storage.from(bucket).remove([storagePath]);
      if (!removal.error) {
        // Storage DELETE may report success when RLS matched zero rows. Prove
        // the public object still exists instead of relying on the status code.
        const stillPresent = await fetch(publicUrlData.publicUrl);
        expect(stillPresent.status).toBe(200);
      }
    }

    const adminListing = await adminClient.storage.from(bucket).list(folder);
    expect(adminListing.error).toBeNull();
    expect(adminListing.data.map((item) => item.name)).toContain('cover.png');

    const adminUpdate = await adminClient.storage.from(bucket).update(storagePath, fileBytes, {
      contentType: 'image/png',
      upsert: true,
    });
    expect(adminUpdate.error).toBeNull();

    const adminRemoval = await adminClient.storage.from(bucket).remove([storagePath]);
    expect(adminRemoval.error).toBeNull();
    storagePath = '';
  });
});
