import { initialProducts } from '../data/demoProducts';
import { assertDatabaseWriteAllowed, runtimeSafety } from '../config/runtimeSafety';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

const PRODUCTS_TABLE = 'products';
const PRODUCT_STORAGE_KEY = 'tnk-admin-products-v1';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const stockStatusLabels = {
  in_stock: 'In stock',
  low_stock: 'Limited stock',
  out_of_stock: 'Out of stock',
  preorder: 'Preorder',
};

export function slugify(value) {
  const slug = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return slug || `book-${Date.now()}`;
}

export function parseImageList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value || '')
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && window.localStorage;
}

function isUuid(value) {
  return uuidPattern.test(String(value || ''));
}

function toStockStatus(value = '') {
  const normalizedValue = String(value).trim().toLowerCase().replace(/\s+/g, '_');

  if (normalizedValue === 'in_stock') return 'in_stock';
  if (normalizedValue === 'low_stock' || normalizedValue === 'limited_stock') return 'low_stock';
  if (normalizedValue === 'out_of_stock') return 'out_of_stock';
  if (normalizedValue === 'preorder') return 'preorder';
  if (normalizedValue.includes('out')) return 'out_of_stock';
  if (normalizedValue.includes('limited') || normalizedValue.includes('low')) return 'low_stock';

  return 'in_stock';
}

function fromStockStatus(value = '') {
  return stockStatusLabels[toStockStatus(value)] || value || 'In stock';
}

function getInitialProductImageData(productId) {
  const initialProduct = initialProducts.find((item) => item.id === productId);

  return {
    coverImageUrl: initialProduct?.coverImageUrl || '',
    galleryImages: initialProduct?.galleryImages || [],
    imageAlt: initialProduct?.imageAlt || '',
  };
}

export function normalizeProduct(product = {}) {
  const categories = Array.isArray(product.categories)
    ? product.categories
    : Array.isArray(product.tags)
      ? product.tags
    : String(product.categoriesText || product.category || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
  const title = product.title || 'Untitled Book';
  const category = product.category || categories[0] || 'Devotional';
  const productSlug = product.slug || slugify(title);
  const productId = product.id && !isUuid(product.id) ? product.id : productSlug;
  const dbId = product.dbId || product.db_id || (isUuid(product.id) ? product.id : '');
  const hasImageFields = [
    'coverImageUrl',
    'cover_image_url',
    'galleryImages',
    'gallery_images',
    'galleryImagesText',
    'imageAlt',
    'image_alt',
  ].some((key) => Object.prototype.hasOwnProperty.call(product, key));
  const initialImageData = hasImageFields ? {} : getInitialProductImageData(productId);
  const coverImageUrl = String(product.coverImageUrl || product.cover_image_url || initialImageData.coverImageUrl || '').trim();
  const galleryImages = parseImageList(
    product.galleryImages || product.gallery_images || product.galleryImagesText || initialImageData.galleryImages,
  );
  const imageAlt = String(product.imageAlt || product.image_alt || initialImageData.imageAlt || '').trim();

  return {
    id: productId,
    dbId,
    slug: productSlug,
    title,
    subtitle: product.subtitle || 'Book details',
    author: product.author || 'Traditional Text',
    publisher: product.publisher || 'T N K Publications',
    language: product.language || 'Kannada',
    type: product.type || product.book_type || product.binding || 'Paperback',
    category,
    categories: categories.length ? Array.from(new Set([category, ...categories])) : [category],
    price: Number(product.price) || 0,
    mrp: Number(product.mrp) || Number(product.price) || 0,
    rating: Number(product.rating) || 4.8,
    reviews: Number(product.reviews ?? product.review_count) || 0,
    pages: Number(product.pages) || 0,
    isbn: product.isbn || product.sku || `TNK-${slugify(title).toUpperCase()}`,
    badge: product.badge || 'New Arrival',
    stock: product.stock || fromStockStatus(product.stock_status),
    cover: product.cover || product.cover_style || 'cover-saffron',
    coverImageUrl,
    galleryImages,
    imageAlt,
    isActive: product.isActive ?? product.is_active ?? true,
    description: product.description || product.short_description || '',
    syncStatus: product.syncStatus || product.sync_status || '',
    syncMessage: product.syncMessage || product.sync_message || '',
    isCatalogPreview: product.isCatalogPreview ?? runtimeSafety.useBundledPreviewCatalog,
  };
}

export function getBundledPreviewProducts() {
  return initialProducts.map((product) => normalizeProduct({ ...product, isCatalogPreview: true }));
}

function readLocalProducts() {
  if (!canUseLocalStorage()) return initialProducts.map(normalizeProduct);

  try {
    const stored = window.localStorage.getItem(PRODUCT_STORAGE_KEY);
    if (!stored) return initialProducts.map(normalizeProduct);
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.length
      ? parsed.map(normalizeProduct)
      : initialProducts.map(normalizeProduct);
  } catch {
    return initialProducts.map(normalizeProduct);
  }
}

function writeLocalProducts(products) {
  const normalizedProducts = products.map(normalizeProduct);

  if (canUseLocalStorage()) {
    window.localStorage.setItem(PRODUCT_STORAGE_KEY, JSON.stringify(normalizedProducts));
  }

  return normalizedProducts;
}

function isSupabaseWriteBlocked(error) {
  const message = String(error?.message || error?.details || '').toLowerCase();
  return error?.code === '42501' || message.includes('row-level security') || message.includes('permission denied');
}

function isSupabaseSessionError(error) {
  const message = String(error?.message || error?.details || '').toLowerCase();
  const status = Number(error?.status || 0);

  return status === 401 || message.includes('jwt') || message.includes('session') || message.includes('expired');
}

function toSupabaseProduct(product) {
  const normalizedProduct = normalizeProduct(product);
  const now = new Date().toISOString();

  return {
    slug: normalizedProduct.slug,
    title: normalizedProduct.title,
    subtitle: normalizedProduct.subtitle,
    short_description: normalizedProduct.subtitle,
    description: normalizedProduct.description || null,
    category_id: product.categoryId || product.category_id || null,
    category: normalizedProduct.category,
    author: normalizedProduct.author,
    publisher: normalizedProduct.publisher,
    language: normalizedProduct.language,
    book_type: normalizedProduct.type,
    isbn: normalizedProduct.isbn,
    sku: product.sku || normalizedProduct.isbn,
    pages: normalizedProduct.pages || null,
    badge: normalizedProduct.badge,
    tags: normalizedProduct.categories,
    price: normalizedProduct.price,
    mrp: normalizedProduct.mrp,
    rating: normalizedProduct.rating,
    review_count: normalizedProduct.reviews,
    stock_status: toStockStatus(normalizedProduct.stock),
    stock_quantity: Number(product.stockQuantity ?? product.stock_quantity) || 0,
    cover_style: normalizedProduct.cover,
    cover_image_url: normalizedProduct.coverImageUrl || null,
    gallery_images: normalizedProduct.galleryImages,
    image_alt: normalizedProduct.imageAlt || null,
    is_active: normalizedProduct.isActive,
    updated_at: now,
  };
}

function fromSupabaseProduct(product) {
  return normalizeProduct(product);
}

function throwSupabaseError(error) {
  if (error) {
    if (isSupabaseSessionError(error)) {
      throw new Error('Session expired. Please sign in again.');
    }

    if (isSupabaseWriteBlocked(error)) {
      throw new Error('Permission denied. Please sign in with an authorized Supabase admin account.');
    }

    throw new Error('Supabase request failed. Please try again.');
  }
}

export async function getProducts() {
  if (runtimeSafety.useBundledPreviewCatalog) return getBundledPreviewProducts();
  if (!isSupabaseConfigured) return readLocalProducts();

  const { data, error } = await supabase
    .from(PRODUCTS_TABLE)
    .select('*')
    .order('title', { ascending: true });

  throwSupabaseError(error);
  return (data || []).map(fromSupabaseProduct);
}

export async function getActiveProducts() {
  if (runtimeSafety.useBundledPreviewCatalog) return getBundledPreviewProducts();
  if (!isSupabaseConfigured) {
    return readLocalProducts().filter((product) => product.isActive !== false);
  }

  const { data, error } = await supabase
    .from(PRODUCTS_TABLE)
    .select('*')
    .eq('is_active', true)
    .order('title', { ascending: true });

  throwSupabaseError(error);
  return (data || []).map(fromSupabaseProduct);
}

export async function getProductBySlug(slug) {
  if (runtimeSafety.useBundledPreviewCatalog) {
    return getBundledPreviewProducts().find((product) => product.slug === slug || product.id === slug) || null;
  }

  if (!isSupabaseConfigured) {
    return readLocalProducts().find((product) => product.slug === slug || product.id === slug) || null;
  }

  const slugResult = await supabase
    .from(PRODUCTS_TABLE)
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (slugResult.error) throwSupabaseError(slugResult.error);
  if (slugResult.data) return fromSupabaseProduct(slugResult.data);

  const idResult = await supabase
    .from(PRODUCTS_TABLE)
    .select('*')
    .eq('id', slug)
    .maybeSingle();

  throwSupabaseError(idResult.error);
  return idResult.data ? fromSupabaseProduct(idResult.data) : null;
}

export async function createProduct(product) {
  assertDatabaseWriteAllowed('Creating products');

  if (!isSupabaseConfigured) {
    const currentProducts = readLocalProducts();
    const normalizedProduct = normalizeProduct(product);
    return writeLocalProducts([normalizedProduct, ...currentProducts])[0];
  }

  const { data, error } = await supabase
    .from(PRODUCTS_TABLE)
    .insert(toSupabaseProduct(product))
    .select()
    .single();

  throwSupabaseError(error);

  return fromSupabaseProduct(data);
}

export async function updateProduct(id, product) {
  assertDatabaseWriteAllowed('Updating products');

  if (!isSupabaseConfigured) {
    const currentProducts = readLocalProducts();
    const existingProduct = currentProducts.find((item) => item.id === id);

    if (!existingProduct) {
      throw new Error('Product not found.');
    }

    const updatedProduct = normalizeProduct({ ...existingProduct, ...product, id });
    writeLocalProducts(currentProducts.map((item) => (item.id === id ? updatedProduct : item)));
    return updatedProduct;
  }

  const { data, error } = await supabase
    .from(PRODUCTS_TABLE)
    .update(toSupabaseProduct({ ...product, slug: product.slug || id }))
    .eq(isUuid(id) ? 'id' : 'slug', id)
    .select()
    .single();

  throwSupabaseError(error);

  return fromSupabaseProduct(data);
}

export async function deleteProduct(id) {
  assertDatabaseWriteAllowed('Deleting products');

  if (!isSupabaseConfigured) {
    const currentProducts = readLocalProducts();
    writeLocalProducts(currentProducts.filter((product) => product.id !== id && product.slug !== id && product.dbId !== id));
    return true;
  }

  const { error } = await supabase
    .from(PRODUCTS_TABLE)
    .delete()
    .eq(isUuid(id) ? 'id' : 'slug', id);

  throwSupabaseError(error);

  return true;
}

export async function resetProductsToDemo() {
  assertDatabaseWriteAllowed('Resetting the catalog');

  const demoProducts = initialProducts.map(normalizeProduct);

  if (!isSupabaseConfigured) {
    return writeLocalProducts(demoProducts);
  }

  const { error } = await supabase
    .from(PRODUCTS_TABLE)
    .upsert(demoProducts.map(toSupabaseProduct), { onConflict: 'slug' });

  throwSupabaseError(error);

  return getProducts();
}
