import { assertDatabaseWriteAllowed, canAccessAdmin, canSubmitLiveOrder } from '../config/runtimeSafety';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

const ORDERS_TABLE = 'orders';
const ORDER_ITEMS_TABLE = 'order_items';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return uuidPattern.test(String(value || ''));
}

function createSupabaseOrderNumber() {
  const year = new Date().getFullYear();
  const timestampPart = Date.now().toString(36).toUpperCase().slice(-6);
  const bytes = new Uint8Array(2);

  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    bytes[0] = Math.floor(Math.random() * 256);
    bytes[1] = Math.floor(Math.random() * 256);
  }

  const randomPart = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `TNK-${year}-${timestampPart}${randomPart}`;
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
    createdAt: order.createdAt || order.created_at || new Date().toISOString(),
    updatedAt: order.updatedAt || order.updated_at || '',
  };
}

function toSupabaseOrderPayload(orderPayload) {
  const orderNumber = orderPayload.orderNumber || createSupabaseOrderNumber();
  const now = new Date().toISOString();

  const payload = {
    order_number: orderNumber,
    customer_name: orderPayload.customer?.fullName || '',
    customer_phone: orderPayload.customer?.phone || '',
    customer_email: orderPayload.customer?.email || null,
    delivery_address: orderPayload.customer?.address || '',
    city: orderPayload.customer?.city || '',
    state: orderPayload.customer?.state || null,
    pincode: orderPayload.customer?.pincode || '',
    notes: orderPayload.customer?.notes || null,
    subtotal: Number(orderPayload.subtotal) || 0,
    shipping_fee: Number(orderPayload.shipping) || 0,
    discount: Number(orderPayload.discount) || 0,
    total: Number(orderPayload.total) || 0,
    payment_method: orderPayload.paymentMethod || '',
    order_status: orderPayload.orderStatus || 'pending',
    payment_status: orderPayload.paymentStatus || 'pending',
    whatsapp_message: orderPayload.whatsappMessage || null,
    created_at: orderPayload.createdAt || now,
    updated_at: orderPayload.updatedAt || now,
  };

  if (orderPayload.id) {
    payload.id = orderPayload.id;
  }

  return payload;
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

  const createdAt = new Date().toISOString();

  if (!isSupabaseConfigured || !supabase) throw new Error('Secured order storage is unavailable.');

  const orderNumber = orderPayload.orderNumber || createSupabaseOrderNumber();
  const orderId = isUuid(orderPayload.id) ? orderPayload.id : createClientOrderId();
  const localOrder = normalizeOrder({
    ...orderPayload,
    id: orderId,
    orderNumber,
    items: (orderPayload.items || []).map((item) => ({ ...item })),
    createdAt,
    updatedAt: createdAt,
  });

  const { error } = await supabase
    .from(ORDERS_TABLE)
    .insert(toSupabaseOrderPayload({ ...orderPayload, id: orderId, orderNumber, createdAt, updatedAt: createdAt }));

  throwSupabaseError(error);

  const items = (orderPayload.items || []).map((item) => {
    const quantity = Number(item.quantity) || 1;
    const price = Number(item.price) || 0;

    return {
      order_id: orderId,
      product_id: isUuid(item.dbId || item.product_id || item.id) ? item.dbId || item.product_id || item.id : null,
      title_snapshot: item.title || 'Book',
      sku_snapshot: item.sku || item.isbn || item.id || null,
      price_snapshot: price,
      quantity,
      line_total: price * quantity,
    };
  });

  if (items.length) {
    const { error: itemError } = await supabase
      .from(ORDER_ITEMS_TABLE)
      .insert(items);

    throwSupabaseError(itemError);
  }

  return localOrder;
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
