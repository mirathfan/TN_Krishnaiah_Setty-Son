import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import { slugify } from './productService';

const PRODUCT_IMAGES_BUCKET = 'product-images';
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function getCleanStorageError(error) {
  const message = String(error?.message || '').toLowerCase();

  if (message.includes('bucket') || message.includes('not found')) {
    return 'Product image storage is not ready. Run the product-images storage setup SQL in Supabase.';
  }

  if (message.includes('row-level security') || message.includes('permission') || error?.statusCode === '403') {
    return 'Permission denied. Please sign in with an authorized Supabase admin account before uploading images.';
  }

  if (message.includes('payload') || message.includes('too large')) {
    return 'This image is too large. Please upload an image under 5 MB.';
  }

  return 'Could not upload the image. Please try again.';
}

function getFileExtension(file) {
  const nameExtension = file.name?.split('.').pop()?.toLowerCase();

  if (['jpg', 'jpeg', 'png', 'webp'].includes(nameExtension)) {
    return nameExtension === 'jpeg' ? 'jpg' : nameExtension;
  }

  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

function safeFileName(file) {
  const extension = getFileExtension(file);
  const baseName = String(file.name || 'product-image')
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return `${baseName || 'product-image'}.${extension}`;
}

function safePathSegment(value) {
  return slugify(value || 'new-product');
}

function getStoragePathFromInput(path) {
  const value = String(path || '').trim();
  if (!value) return '';

  const publicPathMarker = `/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/`;
  const markerIndex = value.indexOf(publicPathMarker);

  if (markerIndex >= 0) {
    return decodeURIComponent(value.slice(markerIndex + publicPathMarker.length));
  }

  return value.replace(/^\/+/, '');
}

export function validateImageFile(file) {
  if (!file) {
    throw new Error('Please choose an image file to upload.');
  }

  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Please upload a JPG, PNG, or WebP image.');
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error('This image is too large. Please upload an image under 5 MB.');
  }

  return true;
}

export async function uploadProductImage(file, options = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Image upload requires Supabase configuration. You can still paste an image URL manually while Supabase is unavailable.');
  }

  validateImageFile(file);

  const productKey = safePathSegment(options.productSlugOrId || options.productId || options.productSlug);
  const storagePath = `products/${productKey}/${Date.now()}-${safeFileName(file)}`;

  const { data, error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    throw new Error(getCleanStorageError(error));
  }

  const { data: publicUrlData } = supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .getPublicUrl(data.path);

  return {
    publicUrl: publicUrlData?.publicUrl || '',
    storagePath: data.path,
  };
}

export async function deleteProductImage(path) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Image deletion requires Supabase.');
  }

  const storagePath = getStoragePathFromInput(path);
  if (!storagePath) return true;

  const { error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .remove([storagePath]);

  if (error) {
    throw new Error(getCleanStorageError(error));
  }

  return true;
}
