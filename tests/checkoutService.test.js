import { describe, expect, it } from 'vitest';

import { CheckoutError, buildCheckoutRequest } from '../src/services/orderService';

const productId = 'c4d1ad50-62b6-4e3b-8779-a00b35c9d751';
const idempotencyKey = '4bfe8c44-bf09-4bea-94a4-ec918ed0a7a2';

function request(overrides = {}) {
  return {
    customer: {
      fullName: 'Local Test Customer',
      phone: '+91 9880226598',
      email: 'customer@example.test',
      address: '234 Chickpet Main Road',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560053',
      notes: 'Local test only',
    },
    items: [{ id: 'browser-slug', dbId: productId, title: 'Browser title', price: 0.01, quantity: 2 }],
    paymentMethod: 'upi',
    couponCode: ' save10 ',
    idempotencyKey,
    subtotal: 0.02,
    shipping: 0,
    total: 0.02,
    ...overrides,
  };
}

describe('secure checkout request serialization', () => {
  it('sends only product IDs and quantities and never browser prices or totals', () => {
    const serialized = buildCheckoutRequest(request());

    expect(serialized).toEqual({
      customer: {
        full_name: 'Local Test Customer',
        phone: '+91 9880226598',
        email: 'customer@example.test',
        address: '234 Chickpet Main Road',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560053',
        notes: 'Local test only',
      },
      items: [{ product_id: productId, quantity: 2 }],
      payment_method: 'upi',
      coupon_code: 'SAVE10',
      idempotency_key: idempotencyKey,
    });
    expect(JSON.stringify(serialized)).not.toMatch(/subtotal|shipping|total|price|title/);
  });

  it('rejects cart rows that are not linked to a database product UUID', () => {
    expect(() => buildCheckoutRequest(request({ items: [{ id: 'preview-only', quantity: 1 }] })))
      .toThrow(CheckoutError);
  });
});
