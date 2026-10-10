import { assertDatabaseWriteAllowed, canAccessAdmin, canSubmitLiveOrder } from '../config/runtimeSafety';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

const ORDERS_TABLE = 'orders';
const ORDER_ITEMS_TABLE = 'order_items';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return uuidPattern.test(String(value || ''));
}

function createClientOrderId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);

  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizeOrder(order = {}) {
  const orderItems = order.order_items || order.items || [];
  const customer = order.customer || {
    fullName: order.customer_name || '',
    phone: order.customer_phone || '',
    email: order.customer_email || '',
    address: order.delivery_address || '',
    city: order.delivery_city || order.city || '',
    state: order.delivery_state || order.state || '',
    pincode: order.delivery_pincode || order.pincode || '',
    notes: order.notes || '',
  };
  const orderNumber = order.orderNumber || order.order_number || '';

  return {
    id: order.id || orderNumber || `local-order-${Date.now()}`,
    orderNumber,
    customer,
    items: Array.isArray(orderItems)
      ? orderItems.map((item) => ({
          ...item,
          id: item.id || item.product_id || item.slug,
          title: item.title || item.title_snapshot,
          isbn: item.sku || item.sku_snapshot,
          price: Number(item.price ?? item.price_snapshot) || 0,
          quantity: Number(item.quantity) || 1,
        }))
      : [],
    subtotal: Number(order.subtotal) || 0,
    shipping: Number(order.shipping ?? order.shipping_fee) || 0,
    discount: Number(order.discount) || 0,
    total: Number(order.total) || 0,
    paymentMethod: order.paymentMethod || order.payment_method || '',
    orderStatus: order.orderStatus || order.order_status || order.status || 'pending',
    paymentStatus: order.paymentStatus || order.payment_status || 'pending',
    whatsappMessage: order.whatsappMessage || order.whatsapp_message || '',
    duplicate: order.duplicate === true,
    createdAt: order.createdAt || order.created_at || new Date().toISOString(),
    updatedAt: order.updatedAt || order.updated_at || '',
  };
}

function fromSupabaseOrder(order) {
  return normalizeOrder(order);
}

function throwSupabaseError(error) {
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }
}

export async function createOrder(orderPayload) {
  assertDatabaseWriteAllowed('Creating orders');

  if (!canSubmitLiveOrder()) {
    throw new Error('Online order submission is unavailable while the bookstore is in read-only mode.');
  }

  if (!isSupabaseConfigured || !supabase) throw new Error('Secured order storage is unavailable.');

  const requestBody = buildCheckoutRequest(orderPayload);
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/checkout`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    const responseBody = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new CheckoutError({
        code: responseBody.code,
        message: responseBody.message,
        retryable: responseBody.retryable,
        status: response.status,
        requestId: responseBody.request_id,
      });
    }

    return normalizeOrder({
      ...responseBody,
      customer: orderPayload.customer,
      shipping: responseBody.shipping_fee,
      paymentMethod: responseBody.payment_method,
      paymentStatus: responseBody.payment_status,
      orderStatus: responseBody.order_status,
      createdAt: responseBody.created_at,
      duplicate: responseBody.duplicate === true,
    });
  } catch (error) {
    if (error instanceof CheckoutError) throw error;
    if (error?.name === 'AbortError') {
      throw new CheckoutError({
        code: 'CHECKOUT_TIMEOUT',
        message: 'The secure checkout timed out. Retry with the same request to avoid a duplicate order.',
        retryable: true,
        status: 504,
      });
    }
    throw new CheckoutError({
      code: 'CHECKOUT_NETWORK_ERROR',
      message: 'The secure checkout could not be reached. You can retry or contact the bookstore on WhatsApp.',
      retryable: true,
      status: 0,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export class CheckoutError extends Error {
  constructor({ code = 'CHECKOUT_ERROR', message, retryable = false, status = 0, requestId = '' } = {}) {
    super(message || 'The secure checkout request failed.');
    this.name = 'CheckoutError';
    this.code = code;
    this.retryable = retryable === true;
    this.status = status;
    this.requestId = requestId;
  }
}

export function buildCheckoutRequest(orderPayload = {}) {
  const idempotencyKey = isUuid(orderPayload.idempotencyKey)
    ? orderPayload.idempotencyKey
    : createClientOrderId();
  const items = (orderPayload.items || []).map((item) => {
    const productId = item.dbId || item.product_id || item.id;
    if (!isUuid(productId)) {
      throw new CheckoutError({
        code: 'CHECKOUT_INVALID_PRODUCT',
        message: 'A cart product is not linked to confirmed inventory.',
        retryable: false,
        status: 422,
      });
    }
    return {
      product_id: productId,
      quantity: Number(item.quantity),
    };
  });

  return {
    customer: {
      full_name: orderPayload.customer?.fullName || '',
      phone: orderPayload.customer?.phone || '',
      email: orderPayload.customer?.email || '',
      address: orderPayload.customer?.address || '',
      city: orderPayload.customer?.city || '',
      state: orderPayload.customer?.state || '',
      pincode: orderPayload.customer?.pincode || '',
      notes: orderPayload.customer?.notes || '',
    },
    items,
    payment_method: orderPayload.paymentMethod || '',
    coupon_code: String(orderPayload.couponCode || '').trim().toUpperCase(),
    idempotency_key: idempotencyKey,
  };
}

export async function getOrders() {
  if (!canAccessAdmin()) throw new Error('Admin order access is unavailable while the bookstore is in read-only mode.');
  if (!isSupabaseConfigured || !supabase) throw new Error('Secured order storage is unavailable.');

  const { data, error } = await supabase
    .from(ORDERS_TABLE)
    .select('*, order_items(*)')
    .order('created_at', { ascending: false });

  throwSupabaseError(error);
  return (data || []).map(fromSupabaseOrder);
}

export async function getOrderByOrderNumber(orderNumber) {
  if (!canAccessAdmin()) throw new Error('Order lookup is unavailable while the bookstore is in read-only mode.');
  if (!isSupabaseConfigured || !supabase) throw new Error('Secured order storage is unavailable.');

  const { data, error } = await supabase
    .from(ORDERS_TABLE)
    .select('*, order_items(*)')
    .eq('order_number', orderNumber)
    .maybeSingle();

  throwSupabaseError(error);
  return data ? fromSupabaseOrder(data) : null;
}

export async function updateOrderStatus(orderId, status) {
  assertDatabaseWriteAllowed('Updating order status');
  if (!canAccessAdmin()) throw new Error('Admin order updates are unavailable while the bookstore is in read-only mode.');
  if (!isSupabaseConfigured || !supabase) throw new Error('Secured order storage is unavailable.');

  const { data, error } = await supabase
    .from(ORDERS_TABLE)
    .update({ order_status: status, updated_at: new Date().toISOString() })
    .eq(isUuid(orderId) ? 'id' : 'order_number', orderId)
    .select()
    .single();

  throwSupabaseError(error);
  return fromSupabaseOrder(data);
}

export async function updatePaymentStatus(orderId, status) {
  assertDatabaseWriteAllowed('Updating payment status');
  if (!canAccessAdmin()) throw new Error('Admin payment updates are unavailable while the bookstore is in read-only mode.');
  if (!isSupabaseConfigured || !supabase) throw new Error('Secured order storage is unavailable.');

  const { data, error } = await supabase
    .from(ORDERS_TABLE)
    .update({ payment_status: status, updated_at: new Date().toISOString() })
    .eq(isUuid(orderId) ? 'id' : 'order_number', orderId)
    .select()
    .single();

  throwSupabaseError(error);
  return fromSupabaseOrder(data);
}
