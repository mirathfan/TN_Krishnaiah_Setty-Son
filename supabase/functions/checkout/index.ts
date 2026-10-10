import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const MAX_REQUEST_BYTES = 16 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const ALLOWED_PAYMENT_METHODS = new Set(["upi", "online", "cod", "whatsapp"]);
const ROOT_KEYS = new Set(["customer", "items", "payment_method", "coupon_code", "idempotency_key"]);
const CUSTOMER_KEYS = new Set(["full_name", "phone", "email", "address", "city", "state", "pincode", "notes"]);
const ITEM_KEYS = new Set(["product_id", "quantity"]);

type JsonRecord = Record<string, unknown>;

class CheckoutHttpError extends Error {
  status: number;
  code: string;
  retryable: boolean;
  retryAfter?: number;

  constructor(status: number, code: string, message: string, retryable = false, retryAfter?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.retryAfter = retryAfter;
  }
}

function env(name: string): string {
  return (Deno.env.get(name) || "").trim();
}

function isPlainObject(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: JsonRecord, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function allowedOrigins(): Set<string> {
  return new Set(env("CHECKOUT_ALLOWED_ORIGINS").split(",").map((value) => value.trim()).filter(Boolean));
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  if (!origin || !allowedOrigins().has(origin)) return {};

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "apikey, content-type, x-client-info, x-test-client-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function jsonResponse(request: Request, body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return Response.json(body, {
    status,
    headers: {
      ...corsHeaders(request),
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

function assertExecutionMode(): "local" | "staging" {
  const mode = env("CHECKOUT_EXECUTION_MODE");
  const acknowledgement = env("CHECKOUT_DISPOSABLE_ENV_ACK");
  const deploymentEnvironment = env("CHECKOUT_DEPLOYMENT_ENVIRONMENT");
  const isLocal = mode === "local" && deploymentEnvironment === "local";
  const isStaging = mode === "staging" && deploymentEnvironment === "staging";
  if ((!isLocal && !isStaging) || acknowledgement !== "I_UNDERSTAND_NO_PRODUCTION_CHECKOUT") {
    throw new CheckoutHttpError(
      503,
      "CHECKOUT_UNAVAILABLE",
      "Secure online order requests are not enabled in this environment.",
      true,
    );
  }
  return mode;
}

function assertOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins().has(origin)) {
    throw new CheckoutHttpError(403, "CHECKOUT_ORIGIN_DENIED", "This checkout origin is not allowed.");
  }
}

function validatePayload(raw: unknown): { payload: JsonRecord; idempotencyKey: string } {
  if (!isPlainObject(raw) || !hasOnlyKeys(raw, ROOT_KEYS)) {
    throw new CheckoutHttpError(400, "CHECKOUT_INVALID_INPUT", "The checkout request contains unsupported fields.");
  }

  const idempotencyKey = cleanString(raw.idempotency_key);
  if (!UUID_PATTERN.test(idempotencyKey)) {
    throw new CheckoutHttpError(422, "CHECKOUT_INVALID_IDEMPOTENCY_KEY", "A valid checkout request key is required.");
  }

  if (!isPlainObject(raw.customer) || !hasOnlyKeys(raw.customer, CUSTOMER_KEYS)) {
    throw new CheckoutHttpError(422, "CHECKOUT_INVALID_CUSTOMER", "Please check the customer and delivery details.");
  }

  const customer = {
    full_name: cleanString(raw.customer.full_name),
    phone: cleanString(raw.customer.phone),
    email: cleanString(raw.customer.email),
    address: cleanString(raw.customer.address),
    city: cleanString(raw.customer.city),
    state: cleanString(raw.customer.state),
    pincode: cleanString(raw.customer.pincode),
    notes: cleanString(raw.customer.notes),
  };

  if (
    customer.full_name.length < 2 || customer.full_name.length > 160 ||
    customer.phone.length < 8 || customer.phone.length > 24 || !/^[0-9+() -]+$/.test(customer.phone) ||
    customer.address.length < 5 || customer.address.length > 1000 ||
    customer.city.length < 2 || customer.city.length > 120 ||
    customer.state.length > 120 ||
    customer.pincode.length < 4 || customer.pincode.length > 20 || !/^[0-9A-Za-z -]+$/.test(customer.pincode) ||
    customer.notes.length > 1000 ||
    (customer.email.length > 0 && (customer.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)))
  ) {
    throw new CheckoutHttpError(422, "CHECKOUT_INVALID_CUSTOMER", "Please check the customer and delivery details.");
  }

  if (!Array.isArray(raw.items) || raw.items.length < 1 || raw.items.length > 20) {
    throw new CheckoutHttpError(422, "CHECKOUT_INVALID_ITEMS", "Your cart must contain between 1 and 20 products.");
  }

  const seenProductIds = new Set<string>();
  let totalUnits = 0;
  const items = raw.items.map((rawItem) => {
    if (!isPlainObject(rawItem) || !hasOnlyKeys(rawItem, ITEM_KEYS)) {
      throw new CheckoutHttpError(400, "CHECKOUT_INVALID_ITEMS", "Cart items may include only a product ID and quantity.");
    }
    const productId = cleanString(rawItem.product_id);
    const quantity = typeof rawItem.quantity === "number" ? rawItem.quantity : Number.NaN;
    if (!UUID_PATTERN.test(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new CheckoutHttpError(422, "CHECKOUT_INVALID_ITEMS", "One or more cart items are invalid.");
    }
    if (seenProductIds.has(productId)) {
      throw new CheckoutHttpError(422, "CHECKOUT_DUPLICATE_PRODUCT", "Each product may appear only once in the cart.");
    }
    seenProductIds.add(productId);
    totalUnits += quantity;
    return { product_id: productId, quantity };
  }).sort((left, right) => left.product_id.localeCompare(right.product_id));

  if (totalUnits > 100) {
    throw new CheckoutHttpError(422, "CHECKOUT_INVALID_ITEMS", "The cart contains too many units for one request.");
  }

  const paymentMethod = cleanString(raw.payment_method);
  if (!ALLOWED_PAYMENT_METHODS.has(paymentMethod)) {
    throw new CheckoutHttpError(422, "CHECKOUT_INVALID_PAYMENT_METHOD", "Please select a supported payment preference.");
  }

  const couponCode = cleanString(raw.coupon_code).toUpperCase();
  if (couponCode.length > 64) {
    throw new CheckoutHttpError(422, "CHECKOUT_INVALID_COUPON", "The coupon code is invalid.");
  }

  return {
    idempotencyKey,
    payload: {
      customer,
      items,
      payment_method: paymentMethod,
      coupon_code: couponCode,
    },
  };
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function databaseError(error: { message?: string } | null): CheckoutHttpError {
  const marker = error?.message?.match(/CHECKOUT_[A-Z_]+/)?.[0] || "CHECKOUT_SERVER_ERROR";
  const errors: Record<string, [number, string, boolean]> = {
    CHECKOUT_INVALID_INPUT: [400, "The checkout request is invalid.", false],
    CHECKOUT_INVALID_CUSTOMER: [422, "Please check the customer and delivery details.", false],
    CHECKOUT_INVALID_PAYMENT_METHOD: [422, "Please select a supported payment preference.", false],
    CHECKOUT_INVALID_ITEMS: [422, "One or more cart items are invalid.", false],
    CHECKOUT_DUPLICATE_PRODUCT: [422, "Each product may appear only once in the cart.", false],
    CHECKOUT_PRODUCT_UNAVAILABLE: [409, "A product in your cart is no longer available.", false],
    CHECKOUT_OUT_OF_STOCK: [409, "The requested quantity is no longer available.", false],
    CHECKOUT_INVALID_COUPON: [422, "The coupon is invalid or not applicable.", false],
    CHECKOUT_IDEMPOTENCY_CONFLICT: [409, "This request key was already used for different order details.", false],
  };
  const [status, message, retryable] = errors[marker] || [500, "The order request could not be completed safely.", true];
  return new CheckoutHttpError(status, marker, message, retryable);
}

export default {
  fetch: withSupabase({ auth: "none", cors: "disabled" }, async (request, context) => {
    const requestId = crypto.randomUUID();

    try {
      const mode = assertExecutionMode();
      assertOrigin(request);

      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
      }
      if (request.method !== "POST") {
        throw new CheckoutHttpError(405, "CHECKOUT_METHOD_NOT_ALLOWED", "Only POST checkout requests are accepted.");
      }
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
        throw new CheckoutHttpError(415, "CHECKOUT_CONTENT_TYPE", "Checkout requests must use JSON.");
      }

      const contentLength = Number(request.headers.get("content-length") || 0);
      if (contentLength > MAX_REQUEST_BYTES) {
        throw new CheckoutHttpError(413, "CHECKOUT_REQUEST_TOO_LARGE", "The checkout request is too large.");
      }

      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
        throw new CheckoutHttpError(413, "CHECKOUT_REQUEST_TOO_LARGE", "The checkout request is too large.");
      }

      const pepper = env("CHECKOUT_RATE_LIMIT_PEPPER");
      if (pepper.length < 16) {
        throw new CheckoutHttpError(503, "CHECKOUT_UNAVAILABLE", "Secure online order requests are not configured.", true);
      }
      const forwardedFor = request.headers.get("cf-connecting-ip") ||
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      const localTestIdentity = mode === "local" ? cleanString(request.headers.get("x-test-client-id")) : "";
      const clientHash = await sha256(`${pepper}:${localTestIdentity || forwardedFor}`);
      if (!HASH_PATTERN.test(clientHash)) throw new Error("Unexpected client hash result");

      const limit = Math.min(Math.max(Number(env("CHECKOUT_RATE_LIMIT_MAX")) || 5, 1), 100);
      const windowSeconds = Math.min(Math.max(Number(env("CHECKOUT_RATE_LIMIT_WINDOW_SECONDS")) || 60, 1), 3600);
      const rateResult = await context.supabaseAdmin.rpc("consume_checkout_rate_limit", {
        p_client_hash: clientHash,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      });
      if (rateResult.error) throw databaseError(rateResult.error);
      if (!rateResult.data?.allowed) {
        const retryAfter = Number(rateResult.data?.retry_after_seconds) || windowSeconds;
        throw new CheckoutHttpError(429, "CHECKOUT_RATE_LIMITED", "Too many checkout attempts. Please wait and try again.", true, retryAfter);
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        throw new CheckoutHttpError(400, "CHECKOUT_INVALID_JSON", "The checkout request is not valid JSON.");
      }

      const { payload, idempotencyKey } = validatePayload(parsed);
      const fingerprint = await sha256(JSON.stringify(payload));
      const result = await context.supabaseAdmin.rpc("create_checkout_order", {
        p_payload: payload,
        p_idempotency_key: idempotencyKey,
        p_request_fingerprint: fingerprint,
      });
      if (result.error) throw databaseError(result.error);

      return jsonResponse(request, { ...result.data, request_id: requestId }, result.data?.duplicate ? 200 : 201);
    } catch (error) {
      const safeError = error instanceof CheckoutHttpError
        ? error
        : new CheckoutHttpError(500, "CHECKOUT_SERVER_ERROR", "The order request could not be completed safely.", true);
      // Log only correlation and error classification; never request/customer data.
      console.error(JSON.stringify({ requestId, code: safeError.code, status: safeError.status }));
      return jsonResponse(
        request,
        { code: safeError.code, message: safeError.message, retryable: safeError.retryable, request_id: requestId },
        safeError.status,
        safeError.retryAfter ? { "Retry-After": String(safeError.retryAfter) } : {},
      );
    }
  }),
};
