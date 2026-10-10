import { useEffect, useMemo, useState } from 'react';
import {
  BookCopy,
  BookMarked,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  CreditCard,
  Eye,
  Filter,
  Heart,
  Languages,
  LibraryBig,
  LockKeyhole,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  Minus,
  PackageCheck,
  PackageSearch,
  PhoneCall,
  Plus,
  Search,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Star,
  Store,
  Save,
  Trash2,
  Truck,
  UploadCloud,
  User,
  X,
} from 'lucide-react';

import { initialProducts } from './data/demoProducts';
import {
  canAccessAdmin,
  canSubmitLiveOrder,
  runtimeSafety,
  safeModeMessage,
} from './config/runtimeSafety';
import { isSupabaseConfigured } from './lib/supabaseClient';
import { getRouteFromLocation, isAdminRouteType } from './lib/routes';
import {
  getAdminAuthMode,
  getCurrentAdminSession,
  onAdminAuthStateChange,
  signInAdmin,
  signOutAdmin,
} from './services/authService';
import {
  createOrder as createOrderRecord,
  getOrders as fetchOrders,
  updateOrderStatus as updateOrderStatusRecord,
  updatePaymentStatus as updatePaymentStatusRecord,
} from './services/orderService';
import { uploadProductImage } from './services/imageUploadService';
import {
  createProduct as createProductRecord,
  deleteProduct as deleteProductRecord,
  getProducts as fetchProducts,
  normalizeProduct,
  parseImageList,
  resetProductsToDemo,
  slugify,
  updateProduct as updateProductRecord,
} from './services/productService';

const establishedYear = 1910;
const yearsOfLegacy = new Date().getFullYear() - establishedYear;

const whatsappNumber = '919880226598';
// TODO(client): Replace this fallback with the original shop photo when supplied.
const heroImagePath = '/bookstore-heritage.png';
const businessDetails = {
  phoneDisplay: '+91 9880226598',
  phoneHref: 'tel:+919880226598',
  email: 'tnkpublications@yahoo.com',
  address: 'T N Krishnaiah Setty & Son\n#234 BKG Complex,\nChickpet Main Road,\nBangalore - 560053',
  hours: 'Please call or WhatsApp before visiting',
};

const makeWhatsAppLink = (message) =>
  `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

const generalWhatsAppLink = makeWhatsAppLink(
  'Namaste, I would like to enquire about spiritual books and publications at T N Krishnaiah Setty & Son.',
);

const bulkWhatsAppLink = makeWhatsAppLink(
  'Namaste, I would like to place a bulk order for religious books. Please help me with availability and pricing.',
);

const orderStatusOptions = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];
const paymentStatusOptions = ['pending', 'paid', 'failed', 'refunded'];

const categoryFilters = [
  'Bhagavadgita',
  'Ramayana',
  'Mahabharata',
  'Puranas',
  'Sahasranamas',
  'Stotras',
  'Pooja Vidhana',
  'Vratha Vidhana',
  'Story Books',
  'Yogasana Books',
  'Vastu',
  'Chalisas',
];

const menuGroups = [
  {
    title: 'Scriptures & Epics',
    icon: BookOpen,
    items: ['Bhagavadgita', 'Ramayana', 'Mahabharata', 'Puranas'],
  },
  {
    title: 'Prayer & Practice',
    icon: BookMarked,
    items: ['Sahasranamas', 'Stotras', 'Pooja Vidhana', 'Vratha Vidhana'],
  },
  {
    title: 'Family Reading',
    icon: Sparkles,
    items: ['Story Books', 'Chalisas'],
  },
  {
    title: 'Wellness & Shastra',
    icon: LibraryBig,
    items: ['Yogasana Books', 'Vastu'],
  },
];

const languages = ['Kannada', 'English', 'Hindi', 'Tamil', 'Telugu', 'Marathi', 'Bengali', 'Malayalam'];
const publishers = [
  'T N K Publications',
  'Gita Press Gorakhpur',
  'Chinmaya Prakashana',
  'Agni Prakashana',
  'Eshwari Prakash',
  'P and P Publishers',
  'Devaladakere Prakashana',
];
const bookTypes = ['Paperback', 'E-book'];
const adminAuthMode = getAdminAuthMode();
const isReadOnlyMode = runtimeSafety.readOnly;

const trustItems = [
  { icon: ShieldCheck, title: 'Original Editions', text: 'Trusted publications and curated spiritual titles.' },
  { icon: PackageCheck, title: 'Safe Packing', text: 'Careful packaging for books, sets, and temple orders.' },
  { icon: Truck, title: 'Shipping Support', text: 'Call or WhatsApp to confirm current availability and delivery.' },
  { icon: MessageCircle, title: 'Bulk Orders', text: 'WhatsApp support for temples, schools, and resellers.' },
];

const coverOptions = [
  'cover-saffron',
  'cover-maroon',
  'cover-palm',
  'cover-red',
  'cover-gold',
  'cover-parchment',
  'cover-blue',
  'cover-indigo',
  'cover-crimson',
  'cover-green',
  'cover-brown',
  'cover-yellow',
];

const emptyProductForm = {
  id: '',
  title: '',
  subtitle: '',
  author: '',
  publisher: 'T N K Publications',
  language: 'Kannada',
  type: 'Paperback',
  category: 'Devotional',
  categoriesText: 'Devotional, Religion & Spirituality',
  price: 100,
  mrp: 150,
  rating: 4.8,
  reviews: 0,
  pages: 120,
  isbn: '',
  badge: 'New Arrival',
  stock: 'In stock',
  cover: 'cover-saffron',
  coverImageUrl: '',
  imageAlt: '',
  galleryImagesText: '',
};

function toProductForm(product) {
  return {
    ...emptyProductForm,
    ...product,
    categoriesText: product.categories?.join(', ') || product.category || '',
    coverImageUrl: product.coverImageUrl || product.cover_image_url || '',
    imageAlt: product.imageAlt || product.image_alt || '',
    galleryImagesText: product.galleryImages?.join('\n') || product.gallery_images?.join('\n') || '',
  };
}

function getGalleryTextFromUrls(urls) {
  return Array.from(new Set(parseImageList(urls))).join('\n');
}

function formatPrice(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

function formatDateTime(value) {
  if (!value) return 'Not recorded';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';

  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatStatusLabel(value = '') {
  return String(value || 'pending')
    .split(/[_-]/)
    .filter(Boolean)
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1))
    .join(' ');
}

function getOrderStatusClass(status = '') {
  const normalizedStatus = String(status).toLowerCase();

  if (normalizedStatus === 'delivered') return 'border-[#9fd7a8] bg-[#eefaf1] text-[#1f7a3b]';
  if (normalizedStatus === 'cancelled') return 'border-[#e7b5b5] bg-[#fff1f1] text-[#9b1c2c]';
  if (normalizedStatus === 'shipped' || normalizedStatus === 'packed') return 'border-[#b8cbe6] bg-[#eef5ff] text-[#285c95]';
  if (normalizedStatus === 'confirmed') return 'border-[#e8c58b] bg-[#fff7e8] text-[#8c4b0b]';

  return 'border-[#eadfca] bg-[#fffdf8] text-[#715240]';
}

function getPaymentStatusClass(status = '') {
  const normalizedStatus = String(status).toLowerCase();

  if (normalizedStatus === 'paid') return 'border-[#9fd7a8] bg-[#eefaf1] text-[#1f7a3b]';
  if (normalizedStatus === 'failed') return 'border-[#e7b5b5] bg-[#fff1f1] text-[#9b1c2c]';
  if (normalizedStatus === 'refunded') return 'border-[#b8cbe6] bg-[#eef5ff] text-[#285c95]';

  return 'border-[#e8c58b] bg-[#fff7e8] text-[#8c4b0b]';
}

function getCartCount(cart) {
  return Object.values(cart).reduce((sum, item) => sum + item.quantity, 0);
}

function getOrderTotals(cartItems) {
  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = subtotal > 499 || subtotal === 0 ? 0 : 60;
  const total = subtotal + shipping;

  return { subtotal, shipping, total };
}

function getPaymentMethodLabel(method) {
  const labels = {
    upi: 'UPI',
    online: 'Cards / Online Payment',
    cod: 'Cash on Delivery',
    whatsapp: 'WhatsApp Confirmation',
  };

  return labels[method] || method || '';
}

function makeCartWhatsAppMessage(cartItems, customer = {}, orderNumber = '', paymentMethod = '') {
  const { shipping, total } = getOrderTotals(cartItems);
  const itemLines = cartItems.map(
    (item, index) => `${index + 1}. ${item.title} x ${item.quantity} - ${formatPrice(item.price * item.quantity)}`,
  );
  const deliveryParts = [customer.city, customer.pincode].filter(Boolean).join(' / ');

  return [
    'Namaste, I would like to place an order with T N Krishnaiah Setty & Son.',
    orderNumber ? `Temporary order number: ${orderNumber}` : '',
    itemLines.length ? 'Books:' : '',
    ...itemLines,
    `${isReadOnlyMode ? 'Preview total (not confirmed)' : 'Total amount'}: ${formatPrice(total)}`,
    `Shipping: ${shipping ? formatPrice(shipping) : 'Free'}`,
    customer.fullName ? `Customer name: ${customer.fullName}` : '',
    customer.phone ? `Phone / WhatsApp: ${customer.phone}` : '',
    deliveryParts ? `Delivery city / pincode: ${deliveryParts}` : '',
    paymentMethod ? `Preferred payment method: ${getPaymentMethodLabel(paymentMethod)}` : '',
    'Please confirm payment and dispatch details.',
  ]
    .filter(Boolean)
    .join('\n');
}

const CUSTOMER_WISHLIST_STORAGE_KEY = 'tnk-customer-wishlist-v1';

const emptyCustomerProfile = {
  fullName: '',
  phone: '',
  email: '',
  city: '',
  pincode: '',
};

const emptyBulkOrderProfile = {
  organizationName: '',
  contactName: '',
  phone: '',
  city: '',
  requirement: '',
};

function canUseCustomerStorage() {
  return typeof window !== 'undefined' && window.localStorage;
}

function readLocalPreference(key, fallback) {
  if (!canUseCustomerStorage()) return fallback;

  try {
    const stored = window.localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalPreference(key, value) {
  if (!canUseCustomerStorage()) return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can fail in private browsing. The in-memory state still works.
  }
}

function normalizeCustomerProfile(profile = {}) {
  return {
    fullName: String(profile.fullName || '').trim(),
    phone: String(profile.phone || '').trim(),
    email: String(profile.email || '').trim(),
    city: String(profile.city || '').trim(),
    pincode: String(profile.pincode || '').trim(),
  };
}

function normalizeBulkOrderProfile(profile = {}) {
  return {
    organizationName: String(profile.organizationName || '').trim(),
    contactName: String(profile.contactName || '').trim(),
    phone: String(profile.phone || '').trim(),
    city: String(profile.city || '').trim(),
    requirement: String(profile.requirement || '').trim(),
  };
}

function normalizeCustomerOrder(order = {}) {
  return {
    ...order,
    items: Array.isArray(order.items) ? order.items.map((item) => ({ ...item })) : [],
    customer: { ...(order.customer || {}) },
  };
}

function makeBulkProfileWhatsAppMessage(profile = {}) {
  return [
    'Namaste, I would like help with a bulk order from T N Krishnaiah Setty & Son.',
    profile.organizationName ? `Temple / institution / group: ${profile.organizationName}` : '',
    profile.contactName ? `Contact person: ${profile.contactName}` : '',
    profile.phone ? `Phone / WhatsApp: ${profile.phone}` : '',
    profile.city ? `City: ${profile.city}` : '',
    profile.requirement ? `Books / requirement: ${profile.requirement}` : '',
    'Please confirm availability, pricing, packing, and delivery options.',
  ]
    .filter(Boolean)
    .join('\n');
}

function getProductSku(product) {
  return product.isbn || product.id?.toUpperCase() || '';
}

function getProductImageAlt(product) {
  return product.imageAlt || product.image_alt || product.title;
}

function getProductImages(product) {
  const images = [
    product.coverImageUrl || product.cover_image_url,
    ...parseImageList(product.galleryImages || product.gallery_images),
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  return Array.from(new Set(images));
}

function getStockState(stock = '') {
  const normalizedStock = stock.toLowerCase();

  if (normalizedStock.includes('out')) {
    return {
      label: 'Out of stock',
      note: 'Please enquire on WhatsApp and we will confirm the next availability.',
      available: false,
      dot: 'bg-[#9b1c2c]',
      text: 'text-[#9b1c2c]',
      background: 'bg-[#fff1f1]',
      border: 'border-[#e6b8b8]',
    };
  }

  if (normalizedStock.includes('limited') || normalizedStock.includes('low')) {
    return {
      label: 'Low stock',
      note: 'Only limited copies may be available. WhatsApp us for bulk quantities.',
      available: true,
      dot: 'bg-[#b26a12]',
      text: 'text-[#8c4b0b]',
      background: 'bg-[#fff7e8]',
      border: 'border-[#e8c58b]',
    };
  }

  return {
    label: 'In stock',
    note: 'Usually dispatched in 1-2 business days.',
    available: true,
    dot: 'bg-[#1f7a3b]',
    text: 'text-[#1f7a3b]',
    background: 'bg-[#eefaf1]',
    border: 'border-[#bfe3c7]',
  };
}

function getProductDescription(product) {
  if (product.description) return product.description;

  const parts = [
    product.title,
    product.category ? `is listed under ${product.category}` : 'is part of our curated religious book collection',
    product.language ? `and is available in ${product.language}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return `${parts}. This page includes the available edition details, publication information, delivery guidance, and ordering options so you can confirm the book before purchase or enquiry.`;
}

function RatingStars({ rating, size = 'h-4 w-4' }) {
  const normalizedRating = Math.max(0, Math.min(5, Number(rating) || 0));

  return (
    <span className="inline-flex items-center" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => {
        const fill = Math.max(0, Math.min(1, normalizedRating - index)) * 100;

        return (
          <span key={index} className={`relative ${size} text-[#d8c09a]`}>
            <Star className={`${size} fill-current`} />
            <span className="absolute inset-0 overflow-hidden text-[#d68616]" style={{ width: `${fill}%` }}>
              <Star className={`${size} fill-current`} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

function RatingSummary({ rating, reviews }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <RatingStars rating={rating} />
      <span className="font-extrabold text-[#351b12]">{Number(rating || 0).toFixed(1)}</span>
      <span className="font-semibold text-[#715240]">({Number(reviews || 0).toLocaleString('en-IN')} reviews)</span>
    </div>
  );
}

function QuantitySelector({ quantity, onDecrease, onIncrease, compact = false }) {
  const buttonSize = compact ? 'h-9 w-9' : 'h-12 w-12';
  const valueSize = compact ? 'h-9 min-w-10' : 'h-12 min-w-12';

  return (
    <div className="inline-flex items-center overflow-hidden rounded-md border border-[#d9c396] bg-white">
      <button
        type="button"
        onClick={onDecrease}
        className={`grid ${buttonSize} place-items-center text-[#64131d] transition hover:bg-[#fff3d7]`}
        aria-label="Decrease quantity"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className={`grid ${valueSize} place-items-center border-x border-[#d9c396] text-sm font-extrabold text-[#351b12]`}>
        {quantity}
      </span>
      <button
        type="button"
        onClick={onIncrease}
        className={`grid ${buttonSize} place-items-center text-[#64131d] transition hover:bg-[#fff3d7]`}
        aria-label="Increase quantity"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

function ProductInfoPanel({ title, children, className = '' }) {
  return (
    <section className={`border border-[#eadfca] bg-white p-5 shadow-sm shadow-[#64131d]/5 ${className}`}>
      <h2 className="font-serif text-2xl font-bold text-[#351b12]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ProductImage({ product, imageUrl, variant = 'card', className = '' }) {
  const [hasError, setHasError] = useState(false);
  const resolvedImageUrl = String(imageUrl || product.coverImageUrl || product.cover_image_url || '').trim();

  useEffect(() => {
    setHasError(false);
  }, [resolvedImageUrl]);

  const imageClassByVariant = {
    card: 'max-h-[86%] max-w-[76%] rounded-sm object-contain shadow-xl shadow-[#351b12]/18',
    detail: 'max-h-[220px] max-w-[78%] rounded-sm object-contain shadow-2xl shadow-[#351b12]/22 sm:max-h-[330px]',
    modal: 'max-h-[300px] max-w-[78%] rounded-sm object-contain shadow-2xl shadow-[#351b12]/20',
    mini: 'h-16 w-11 rounded-sm object-contain shadow-md shadow-[#351b12]/18',
    thumb: 'h-16 w-12 rounded-sm object-contain',
  };
  const fallbackClassByVariant = {
    card: '',
    detail: 'product-cover',
    modal: 'large',
    mini: 'mini',
    thumb: 'mini',
  };

  if (resolvedImageUrl && !hasError) {
    return (
      <img
        src={resolvedImageUrl}
        alt={getProductImageAlt(product)}
        loading="lazy"
        onError={() => setHasError(true)}
        className={`${imageClassByVariant[variant] || imageClassByVariant.card} ${className}`}
      />
    );
  }

  return (
    <div className={`book-cover ${fallbackClassByVariant[variant] || ''} ${product.cover} ${className}`}>
      <small>{product.badge || product.category}</small>
      <strong>{product.title}</strong>
      <span>{product.subtitle}</span>
    </div>
  );
}

function Header({
  cartCount,
  wishlistCount,
  searchTerm,
  onSearch,
  onOpenCart,
  onOpenTrack,
  onOpenAccount,
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMegaOpen, setIsMegaOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[#e5d2a8] bg-[#fffaf0]/95 shadow-[0_10px_35px_rgba(86,18,24,0.08)] backdrop-blur-xl">
      <div className="bg-[#64131d] px-4 py-2 text-[#fff6dd]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 text-xs font-semibold sm:text-sm">
          <p className="hidden sm:block">Traditional. Authentic. Trusted since {establishedYear}.</p>
          <div className="ml-auto flex items-center gap-4">
            <a href={bulkWhatsAppLink} className="hidden items-center gap-2 hover:text-white md:inline-flex">
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Bulk Orders
            </a>
            <a href={businessDetails.phoneHref} className="inline-flex items-center gap-2 hover:text-white">
              <PhoneCall className="h-4 w-4" aria-hidden="true" />
              {businessDetails.phoneDisplay}
            </a>
            <button type="button" onClick={onOpenTrack} className="hidden hover:text-white sm:inline">
              Track Order
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[390px_1fr_auto] lg:items-center lg:px-6">
        <div className="flex items-center justify-between">
          <a href="#home" className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-lg bg-[#64131d] text-[#f3c76a] shadow-lg shadow-[#64131d]/20">
              <BookOpen className="h-6 w-6" aria-hidden="true" />
            </span>
            <span className="leading-tight">
              <span className="block font-serif text-xl font-bold text-[#31140e] sm:text-2xl">
                T N Krishnaiah Setty & Son
              </span>
              <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-[#a17328]">
                Publishers and Booksellers
              </span>
              <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-[#7a5a43]">
                Estd. {establishedYear}
              </span>
            </span>
          </a>

          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-lg border border-[#dec890] text-[#64131d] lg:hidden"
            aria-label="Toggle menu"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((value) => !value)}
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <form className="relative" onSubmit={(event) => event.preventDefault()}>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#9d8064]" />
          <input
            value={searchTerm}
            onChange={(event) => onSearch(event.target.value)}
            type="search"
            placeholder="Search books..."
            className="h-13 w-full rounded-lg border border-[#d9c396] bg-white px-12 pr-16 text-sm font-medium text-[#351b12] outline-none transition focus:border-[#7c1424] focus:ring-4 focus:ring-[#f3c76a]/25"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1.5 grid h-10 w-11 place-items-center rounded-md bg-[#64131d] text-white transition hover:bg-[#7c1424]"
            aria-label="Search"
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>
        </form>

        <div className="hidden items-center gap-2 lg:flex">
          <button type="button" onClick={onOpenAccount} className="header-action">
            <User className="h-5 w-5" aria-hidden="true" />
            <span>Account</span>
          </button>
          <a href="#catalog" className="header-action">
            <Heart className="h-5 w-5" aria-hidden="true" />
            <span>Wishlist {wishlistCount}</span>
          </a>
          <button type="button" onClick={onOpenCart} className="header-action relative">
            <ShoppingCart className="h-5 w-5" aria-hidden="true" />
            <span>Cart</span>
            <strong className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#64131d] px-1 text-[11px] text-white">
              {cartCount}
            </strong>
          </button>
        </div>
      </div>

      <nav className={`${isMenuOpen ? 'block' : 'hidden'} border-t border-[#eadfca] bg-[#fffaf0] lg:block`}>
        <div className="relative mx-auto flex max-w-7xl flex-col lg:flex-row lg:items-center lg:px-6">
          <button
            type="button"
            className="flex items-center justify-between bg-[#64131d] px-5 py-4 text-left text-sm font-bold text-white lg:w-[260px]"
            onClick={() => setIsMegaOpen((value) => !value)}
          >
            <span className="inline-flex items-center gap-3">
              <Menu className="h-5 w-5" aria-hidden="true" />
              All Categories
            </span>
            <ChevronDown className={`h-4 w-4 transition ${isMegaOpen ? 'rotate-180' : ''}`} />
          </button>
          <div className="flex flex-col lg:flex-row lg:items-center">
            {['Bhagavadgita', 'Ramayana', 'Mahabharata', 'Puranas', 'Sahasranamas', 'Stotras'].map((item) => (
              <a
                key={item}
                href="#catalog"
                className="shrink-0 whitespace-nowrap border-b border-[#eadfca] px-5 py-4 text-sm font-semibold text-[#3f251b] transition hover:bg-[#fff3d7] hover:text-[#64131d] lg:border-b-0"
              >
                {item}
              </a>
            ))}
          </div>

          <div className="grid gap-3 border-t border-[#eadfca] p-4 lg:hidden">
            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                onOpenAccount();
              }}
              className="secondary-button w-full justify-start"
            >
              <User className="h-5 w-5" aria-hidden="true" />
              Account
            </button>
            <a href="#catalog" onClick={() => setIsMenuOpen(false)} className="secondary-button w-full justify-start">
              <Heart className="h-5 w-5" aria-hidden="true" />
              Wishlist {wishlistCount}
            </a>
            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                onOpenCart();
              }}
              className="secondary-button w-full justify-start"
            >
              <ShoppingCart className="h-5 w-5" aria-hidden="true" />
              Cart {cartCount}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                onOpenTrack();
              }}
              className="secondary-button w-full justify-start"
            >
              <PackageSearch className="h-5 w-5" aria-hidden="true" />
              Track Order
            </button>
          </div>

          {isMegaOpen && (
            <div className="left-6 top-full z-50 w-full border-t border-[#eadfca] bg-white shadow-2xl lg:absolute lg:w-[980px] lg:border lg:border-[#e5d2a8]">
              <div className="grid gap-0 p-4 sm:grid-cols-2 lg:grid-cols-4">
                {menuGroups.map((group) => {
                  const Icon = group.icon;
                  return (
                    <div key={group.title} className="border-[#eadfca] p-4 lg:border-r last:lg:border-r-0">
                      <div className="mb-4 flex items-center gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-md bg-[#fff4d8] text-[#8c5f17]">
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <p className="font-serif text-lg font-bold text-[#351b12]">{group.title}</p>
                      </div>
                      <div className="grid gap-2">
                        {group.items.map((item) => (
                          <a key={item} href="#catalog" className="text-sm font-medium text-[#684939] hover:text-[#64131d]">
                            {item}
                          </a>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="grid gap-3 border-t border-[#eadfca] bg-[#fffaf0] p-4 md:grid-cols-2">
                <a href={bulkWhatsAppLink} className="mega-cta">
                  <MessageCircle className="h-5 w-5" aria-hidden="true" />
                  <span>
                    <strong>WhatsApp Bulk Order</strong>
                    <small>For temples, schools, institutions, and resellers</small>
                  </span>
                </a>
                <button type="button" onClick={onOpenTrack} className="mega-cta text-left">
                  <PackageSearch className="h-5 w-5" aria-hidden="true" />
                  <span>
                    <strong>Track Order</strong>
                    <small>Contact the shop for status while online tracking is unavailable</small>
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}

function ReadOnlyBanner() {
  return (
    <section className="border-b border-[#e8c58b] bg-[#fff3d7] px-4 py-3" role="status" aria-label="Store availability notice">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 text-sm text-[#6f3c0a] sm:flex-row sm:items-center sm:justify-between">
        <p className="font-bold">
          Preview catalog: prices, stock labels, and availability are not confirmed. Online checkout is temporarily disabled.
        </p>
        <a href={generalWhatsAppLink} className="inline-flex shrink-0 items-center gap-2 font-extrabold text-[#1f6a36] hover:text-[#154c28]">
          <MessageCircle className="h-4 w-4" />
          Confirm on WhatsApp
        </a>
      </div>
    </section>
  );
}

function Hero({ onCategorySelect }) {
  return (
    <section id="home" className="relative overflow-hidden bg-[#fffaf0]">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[55%] bg-[linear-gradient(90deg,#fffaf0_0%,rgba(255,250,240,0.92)_70%,rgba(255,250,240,0)_100%)]" />
      <div className="mx-auto grid max-w-7xl lg:grid-cols-[1fr_0.98fr]">
        <div className="relative z-10 px-4 py-10 sm:px-6 sm:py-12 lg:py-14">
          <h1 className="max-w-3xl font-serif text-[34px] font-extrabold leading-tight text-[#35110f] sm:text-5xl lg:text-6xl">
            Publishers &amp; Booksellers Since {establishedYear}
          </h1>
          <p className="mt-3 text-sm font-extrabold uppercase tracking-[0.2em] text-[#9b6819]">
            Estd. {establishedYear}
          </p>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#644535] sm:mt-5 sm:text-lg sm:leading-8">
            With a proud legacy spanning over 120 years, we are publishers and wholesalers of multilingual books specializing in Dharmik, Religious, Philosophical, Occult Science, Vastu Shastra, Astrological, Spiritual, and General literature. Our extensive collection serves readers, booksellers, educational institutions, and libraries, reflecting our enduring commitment to knowledge, culture, tradition, and lifelong learning.
          </p>

          <div className="mt-6 overflow-hidden border border-[#e5d2a8] shadow-lg shadow-[#64131d]/10 lg:hidden">
            <img
              src={heroImagePath}
              alt="Bookstore shelves for religious and traditional books"
              className="h-28 w-full object-cover sm:h-36"
            />
          </div>

          <div className="hero-actions mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row">
            <a href="#catalog" className="primary-button">
              <BookOpen className="h-5 w-5" aria-hidden="true" />
              Shop Books
            </a>
            <a href={bulkWhatsAppLink} className="secondary-button">
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
              WhatsApp Bulk Order
            </a>
          </div>

          <div className="mt-7 hidden max-w-3xl gap-3 md:grid md:grid-cols-2 xl:grid-cols-4">
            {trustItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex gap-3 border-l border-[#dfc78e] bg-white/62 p-3 shadow-sm">
                  <Icon className="mt-1 h-5 w-5 shrink-0 text-[#9b6819]" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-extrabold text-[#351b12]">{item.title}</p>
                    <p className="mt-1 text-xs leading-5 text-[#7a5a43]">{item.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative hidden min-h-[380px] overflow-hidden border-t border-[#eadfca] lg:block lg:border-l lg:border-t-0">
          <img
            src={heroImagePath}
            alt="Bookstore shelves for religious and traditional books"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,250,240,0.22),rgba(40,18,10,0.04)),linear-gradient(0deg,rgba(48,16,14,0.68),rgba(48,16,14,0.04)_54%)]" />
          <div className="absolute bottom-6 left-6 right-6 grid gap-3 sm:grid-cols-3">
            {[
              ['Best Sellers', 'Curated devotional books'],
              ['Pooja Sets', 'Vrata, stotra, and homa texts'],
              ['Bulk Help', 'Order by WhatsApp or phone'],
            ].map(([title, text]) => (
              <button
                key={title}
                type="button"
                onClick={() => onCategorySelect(title === 'Best Sellers' ? 'All Books' : title === 'Pooja Sets' ? 'Pooja Vidhana' : 'Story Books')}
                className="border border-white/18 bg-[#fffaf0]/94 p-4 text-left shadow-xl backdrop-blur transition hover:-translate-y-0.5"
              >
                <p className="font-serif text-lg font-bold text-[#351b12]">{title}</p>
                <p className="mt-1 text-xs font-medium leading-5 text-[#715240]">{text}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CategoryStrip({ active, onSelect }) {
  const shortcuts = ['All Books', ...categoryFilters];

  return (
    <div className="scrollbar-hide flex gap-3 overflow-x-auto pb-2">
      {shortcuts.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onSelect(item)}
          className={`shrink-0 rounded-md border px-5 py-3 text-sm font-bold transition ${
            active === item
              ? 'border-[#64131d] bg-[#64131d] text-white shadow-lg shadow-[#64131d]/18'
              : 'border-[#d9c396] bg-white text-[#4c2b1f] hover:border-[#64131d]'
          }`}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

function FilterSidebar({
  selectedCategories,
  onToggleCategory,
  selectedLanguage,
  onLanguage,
  selectedPublisher,
  onPublisher,
  selectedType,
  onType,
  onClear,
}) {
  return (
    <aside className="border border-[#e5d2a8] bg-white">
      <div className="flex items-center justify-between border-b border-[#eadfca] px-4 py-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-[#8c5f17]" aria-hidden="true" />
          <h2 className="font-serif text-xl font-bold text-[#351b12]">Filters</h2>
        </div>
        <button type="button" onClick={onClear} className="text-xs font-bold text-[#9b1c2c] hover:text-[#64131d]">
          Clear All
        </button>
      </div>

      <FilterGroup title="Category">
        <div className="grid max-h-[360px] gap-2 overflow-y-auto pr-1">
          {categoryFilters.map((category) => (
            <label key={category} className="flex items-start gap-2 text-sm text-[#51352a]">
              <input
                type="checkbox"
                checked={selectedCategories.includes(category)}
                onChange={() => onToggleCategory(category)}
                className="mt-1 h-4 w-4 rounded border-[#c8b181] accent-[#64131d]"
              />
              <span>{category}</span>
            </label>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Language">
        <SelectControl value={selectedLanguage} onChange={onLanguage} options={languages} placeholder="All languages" />
      </FilterGroup>

      <FilterGroup title="Publisher">
        <SelectControl value={selectedPublisher} onChange={onPublisher} options={publishers} placeholder="All publishers" />
      </FilterGroup>

      <FilterGroup title="Book Type">
        <SelectControl value={selectedType} onChange={onType} options={bookTypes} placeholder="All types" />
      </FilterGroup>
    </aside>
  );
}

function FilterGroup({ title, children }) {
  return (
    <section className="border-b border-[#eadfca] p-4 last:border-b-0">
      <h3 className="mb-3 text-sm font-extrabold uppercase tracking-[0.12em] text-[#84634b]">{title}</h3>
      {children}
    </section>
  );
}

function SelectControl({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 w-full rounded-md border border-[#d9c396] bg-[#fffdf8] px-3 text-sm font-semibold text-[#3f251b] outline-none focus:border-[#64131d] focus:ring-4 focus:ring-[#f3c76a]/25"
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function ProductCard({ product, isWishlisted, onAddToCart, onToggleWishlist }) {
  return (
    <article className="group border border-[#e5d2a8] bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-[#64131d]/10">
      <div className="relative grid aspect-[4/3] place-items-center overflow-hidden bg-[#fff4d8]">
        <a
          href={`#product/${product.id}`}
          className="grid h-full w-full place-items-center p-4"
          aria-label={`Open ${product.title} product page`}
        >
          <ProductImage product={product} variant="card" />
        </a>
        <button
          type="button"
          onClick={() => onToggleWishlist(product.id)}
          className={`absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border bg-white/95 transition ${
            isWishlisted ? 'border-[#9b1c2c] text-[#9b1c2c]' : 'border-[#e1cfaa] text-[#6d5040] hover:text-[#9b1c2c]'
          }`}
          aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          <Heart className={`h-4 w-4 ${isWishlisted ? 'fill-current' : ''}`} />
        </button>
        <a
          href={`#product/${product.id}`}
          className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-[#351b12] text-white opacity-0 transition group-hover:opacity-100"
          aria-label="View product"
        >
          <Eye className="h-4 w-4" />
        </a>
      </div>

      <div className="pt-4">
        {product.isCatalogPreview && (
          <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#9b6819]">
            Preview listing · availability unconfirmed
          </p>
        )}
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="rounded-sm bg-[#fff3d7] px-2 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#8c5f17]">
            {product.category}
          </span>
          <span className="text-xs font-bold text-[#8c4b0b]">
            {product.isCatalogPreview ? 'Check availability' : product.stock}
          </span>
        </div>
        <h3 className="min-h-[52px] font-serif text-xl font-bold leading-snug text-[#351b12]">
          <a href={`#product/${product.id}`} className="transition hover:text-[#64131d]">
            {product.title}
          </a>
        </h3>
        <p className="mt-1 min-h-[42px] text-sm leading-5 text-[#715240]">{product.subtitle}</p>
        <p className="mt-2 text-xs font-bold uppercase tracking-[0.08em] text-[#8a705c]">{product.publisher}</p>
        <div className="mt-3">
          <RatingSummary rating={product.rating} reviews={product.reviews} />
        </div>
        <div className="mt-3 flex items-end gap-2">
          <strong className="text-xl text-[#64131d]">{formatPrice(product.price)}</strong>
          <span className="text-sm font-semibold text-[#8a705c] line-through">{formatPrice(product.mrp)}</span>
        </div>
        {product.isCatalogPreview && <p className="mt-1 text-xs font-semibold text-[#8a705c]">Preview price; confirm before ordering.</p>}
        <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
          <button type="button" onClick={() => onAddToCart(product)} className="cart-button">
            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
            Add to Cart
          </button>
          <a
            href={makeWhatsAppLink(`Namaste, I would like to enquire about "${product.title}" for order or bulk availability.`)}
            className="grid h-11 w-11 place-items-center rounded-md border border-[#1f7a3b] text-[#1f7a3b] transition hover:bg-[#eefaf1]"
            aria-label={`Ask on WhatsApp about ${product.title}`}
          >
            <MessageCircle className="h-4 w-4" />
          </a>
        </div>
      </div>
    </article>
  );
}

function Catalog({
  productsToShow,
  activeShortcut,
  onShortcut,
  selectedCategories,
  onToggleCategory,
  selectedLanguage,
  onLanguage,
  selectedPublisher,
  onPublisher,
  selectedType,
  onType,
  sortBy,
  onSort,
  onClear,
  wishlist,
  onAddToCart,
  onToggleWishlist,
  totalProducts,
  isLoading = false,
  loadError = '',
}) {
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  return (
    <section id="catalog" className="bg-[#fffdf8] px-4 py-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-serif text-3xl font-bold text-[#351b12] sm:text-4xl">Explore Our Collection</h2>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[#715240]">
              Browse our multilingual publishing and bookselling collection by subject,
              language, publisher, and format.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((value) => !value)}
              className="inline-flex items-center gap-2 rounded-md border border-[#d9c396] bg-white px-4 py-3 text-sm font-bold text-[#64131d] lg:hidden"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
            </button>
            <select
              value={sortBy}
              onChange={(event) => onSort(event.target.value)}
              className="h-11 rounded-md border border-[#d9c396] bg-white px-3 text-sm font-bold text-[#3f251b] outline-none"
            >
              <option value="popular">Sort: Popularity</option>
              <option value="new">Sort: New Arrivals</option>
              <option value="low">Price Low to High</option>
              <option value="high">Price High to Low</option>
            </select>
          </div>
        </div>

        <CategoryStrip active={activeShortcut} onSelect={onShortcut} />

        <div className="mt-7 grid gap-6 lg:grid-cols-[282px_1fr]">
          <div className={mobileFiltersOpen ? 'block' : 'hidden lg:block'}>
            <FilterSidebar
              selectedCategories={selectedCategories}
              onToggleCategory={onToggleCategory}
              selectedLanguage={selectedLanguage}
              onLanguage={onLanguage}
              selectedPublisher={selectedPublisher}
              onPublisher={onPublisher}
              selectedType={selectedType}
              onType={onType}
              onClear={onClear}
            />
          </div>

          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-[#eadfca] bg-white px-4 py-3">
              <p className="text-sm font-bold text-[#604638]">
                {isLoading ? 'Loading catalog...' : `Showing ${productsToShow.length} of ${totalProducts} books`}
              </p>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#8a705c]">
                <Languages className="h-4 w-4" aria-hidden="true" />
                Kannada, English, Hindi, Tamil, Telugu and more
              </div>
            </div>
            {loadError && (
              <div className="mb-4 border border-[#e8c58b] bg-[#fff7e8] px-4 py-3 text-sm font-semibold text-[#8c4b0b]" role="status">
                {loadError}
              </div>
            )}

            {productsToShow.length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {productsToShow.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    isWishlisted={wishlist.includes(product.id)}
                    onAddToCart={onAddToCart}
                    onToggleWishlist={onToggleWishlist}
                  />
                ))}
              </div>
            ) : (
              <div className="grid min-h-[320px] place-items-center border border-dashed border-[#d9c396] bg-white p-8 text-center">
                <div>
                  <PackageSearch className="mx-auto h-12 w-12 text-[#9b6819]" />
                  <h3 className="mt-4 font-serif text-2xl font-bold text-[#351b12]">No books matched</h3>
                  <p className="mt-2 max-w-md text-[#715240]">
                    Clear filters or WhatsApp the shop with the title, author, language,
                    or photo of the book you need.
                  </p>
                  <a href={generalWhatsAppLink} className="primary-button mx-auto mt-5 w-fit">
                    <MessageCircle className="h-5 w-5" />
                    Ask on WhatsApp
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function StoreExperience({ onOpenTrack }) {
  return (
    <section className="bg-[#64131d] px-4 py-16 text-white sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
        <div>
          <h2 className="font-serif text-3xl font-bold sm:text-4xl">A complete store flow, with human help when needed</h2>
          <p className="mt-4 max-w-xl text-base leading-8 text-[#ffe4bd]">
            Customers can browse the preview catalog, prepare a cart, and use WhatsApp or call for confirmed availability, current pricing, bulk orders, and hard-to-find titles.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: ShoppingCart, title: 'Preview Cart', text: 'Collect titles and quantities before confirming them with the bookstore.' },
            { icon: CreditCard, title: 'No Online Payment', text: 'Payment and delivery details are arranged only after the bookstore confirms the order.' },
            { icon: PackageSearch, title: 'Tracking Notice', text: 'Online tracking is unavailable; existing customers can contact the shop.', action: onOpenTrack },
          ].map((item) => {
            const Icon = item.icon;
            const content = (
              <>
                <Icon className="h-7 w-7 text-[#f3c76a]" aria-hidden="true" />
                <h3 className="mt-5 text-lg font-extrabold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#ffe4bd]">{item.text}</p>
              </>
            );
            return item.action ? (
              <button key={item.title} type="button" onClick={item.action} className="store-feature text-left">
                {content}
              </button>
            ) : (
              <div key={item.title} className="store-feature">{content}</div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function VisitAndFooter({ onOpenTrack }) {
  return (
    <>
      <section className="bg-[#fffaf0] px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <h2 className="font-serif text-3xl font-bold text-[#351b12] sm:text-4xl">Visit the Chickpet store or order from home</h2>
            <p className="mt-4 max-w-xl text-base leading-8 text-[#715240]">
              Browse the preview collection, then send book names, photos, lists,
              language needs, or bulk enquiries through WhatsApp for confirmation.
            </p>
            <div className="mt-7 grid gap-4">
              <InfoRow icon={MapPin} title="Address" text={businessDetails.address} />
              <InfoRow icon={Clock3} title="Store Hours" text={businessDetails.hours} />
              <InfoRow icon={PhoneCall} title="Phone" text={businessDetails.phoneDisplay} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <a href={generalWhatsAppLink} className="contact-tile bg-[#eefaf1] text-[#154c28]">
              <MessageCircle className="h-8 w-8" />
              <span>WhatsApp Book Enquiry</span>
              <small>Ask availability, language, or edition.</small>
            </a>
            <a href={businessDetails.phoneHref} className="contact-tile bg-[#fff3d7] text-[#64131d]">
              <PhoneCall className="h-8 w-8" />
              <span>Call to Order</span>
              <small>Useful for elderly customers and urgent needs.</small>
            </a>
            <button type="button" onClick={onOpenTrack} className="contact-tile bg-white text-[#351b12] sm:col-span-2">
              <PackageSearch className="h-8 w-8" />
              <span>Order Status Help</span>
              <small>Online tracking is unavailable; contact the shop for an update.</small>
            </button>
          </div>
        </div>
      </section>

      <footer className="bg-[#25100b] px-4 py-10 text-[#f5dfbc] sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1.2fr_0.9fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#64131d] text-[#f3c76a]">
                <BookOpen className="h-5 w-5" />
              </span>
              <p className="font-serif text-xl font-bold text-white">T N Krishnaiah Setty & Son</p>
            </div>
            <p className="mt-3 text-xs font-bold uppercase tracking-[0.16em] text-[#f3c76a]">
              Publishers and Booksellers · Estd. {establishedYear}
            </p>
            <p className="mt-4 max-w-md whitespace-pre-line leading-7">
              {businessDetails.address}
            </p>
            <p className="mt-3">
              <a href={businessDetails.phoneHref} className="font-bold text-white">{businessDetails.phoneDisplay}</a>
            </p>
          </div>
          <FooterColumn title="Shop" items={['Best Sellers', 'New Arrivals', 'Pooja & Vrata', 'Stotra', 'Astrology']} />
          <FooterColumn title="Account" items={['My Account', 'Track Your Order', 'Payment Methods', 'Shipping Guide']} />
          <FooterColumn title="Policies" items={['Terms & Conditions', 'Privacy Policy', 'Return & Refund Policy', 'Shipping Policy']} />
        </div>
        <div className="mx-auto mt-9 flex max-w-7xl flex-col gap-3 border-t border-white/10 pt-6 text-sm text-[#c7aa7a] sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} T N Krishnaiah Setty & Son. All rights reserved.</p>
          <a href={bulkWhatsAppLink} className="inline-flex items-center gap-2 font-bold text-[#f3c76a]">
            <MessageCircle className="h-4 w-4" />
            WhatsApp Bulk Order
          </a>
        </div>
      </footer>
    </>
  );
}

function InfoRow({ icon: Icon, title, text }) {
  return (
    <div className="flex gap-4 border border-[#eadfca] bg-white p-4">
      <Icon className="mt-1 h-5 w-5 shrink-0 text-[#8c5f17]" />
      <div>
        <p className="font-extrabold text-[#351b12]">{title}</p>
        <p className="mt-1 whitespace-pre-line leading-7 text-[#715240]">{text}</p>
      </div>
    </div>
  );
}

function FooterColumn({ title, items }) {
  return (
    <div>
      <p className="font-bold uppercase tracking-[0.14em] text-[#f3c76a]">{title}</p>
      <div className="mt-4 grid gap-2">
        {items.map((item) => (
          <a key={item} href="#catalog" className="hover:text-white">
            {item}
          </a>
        ))}
      </div>
    </div>
  );
}

function ProductModal({ product, isWishlisted, onClose, onAddToCart, onToggleWishlist }) {
  if (!product) return null;

  return (
    <Modal onClose={onClose}>
      <div className="grid gap-7 md:grid-cols-[0.85fr_1.15fr]">
        <div className="grid min-h-[360px] place-items-center bg-[#fff4d8] p-8">
          <ProductImage product={product} variant="modal" />
        </div>
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-[#9b6819]">{product.category}</p>
          {product.isCatalogPreview && (
            <p className="mt-2 border border-[#e8c58b] bg-[#fff7e8] px-3 py-2 text-sm font-bold text-[#8c4b0b]">
              Preview listing. Confirm price and availability on WhatsApp.
            </p>
          )}
          <h2 className="mt-2 font-serif text-3xl font-bold text-[#351b12]">{product.title}</h2>
          <p className="mt-2 text-[#715240]">{product.subtitle}</p>
          <div className="mt-4">
            <RatingSummary rating={product.rating} reviews={product.reviews} />
          </div>
          <div className="mt-5 flex items-end gap-3">
            <strong className="text-3xl text-[#64131d]">{formatPrice(product.price)}</strong>
            <span className="text-lg font-semibold text-[#8a705c] line-through">{formatPrice(product.mrp)}</span>
          </div>
          <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
            {[
              ['Author', product.author],
              ['Publisher', product.publisher],
              ['Language', product.language],
              ['Book Type', product.type],
              ['Pages', product.pages],
              ['ISBN', product.isbn],
            ].map(([label, value]) => (
              <div key={label} className="border border-[#eadfca] bg-[#fffdf8] p-3">
                <p className="font-bold uppercase tracking-[0.1em] text-[#8a705c]">{label}</p>
                <p className="mt-1 font-semibold text-[#351b12]">{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 leading-7 text-[#604638]">
            A curated religious bookstore product page with the metadata customers
            need before purchasing: edition, language, publisher, pages, ISBN,
            reviews, and related categories.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <button type="button" onClick={() => onAddToCart(product)} className="primary-button">
              <ShoppingCart className="h-5 w-5" />
              Add to Cart
            </button>
            <button type="button" onClick={() => onToggleWishlist(product.id)} className="secondary-button">
              <Heart className={`h-5 w-5 ${isWishlisted ? 'fill-current' : ''}`} />
              Wishlist
            </button>
            <a
              href={makeWhatsAppLink(`Namaste, I would like to enquire about "${product.title}".`)}
              className="secondary-button"
            >
              <MessageCircle className="h-5 w-5" />
              WhatsApp
            </a>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ProductPage({ product, relatedProducts, isLoading = false, loadError = '', isWishlisted, wishlist, onAddToCart, onToggleWishlist }) {
  const [quantity, setQuantity] = useState(1);
  const productImages = useMemo(() => (product ? getProductImages(product) : []), [product]);
  const [selectedImage, setSelectedImage] = useState('');

  useEffect(() => {
    setSelectedImage(productImages[0] || '');
  }, [product?.id, productImages]);

  if (isLoading && !product) {
    return (
      <section className="bg-[#fffdf8] px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-3xl place-items-center border border-[#eadfca] bg-white p-10 text-center">
          <PackageSearch className="h-12 w-12 text-[#9b6819]" />
          <h1 className="mt-5 font-serif text-3xl font-bold text-[#351b12]">Loading book details</h1>
          <p className="mt-3 text-[#715240]">
            We are checking the latest catalog information.
          </p>
        </div>
      </section>
    );
  }

  if (!product) {
    return (
      <section className="bg-[#fffdf8] px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-3xl place-items-center border border-dashed border-[#d9c396] bg-white p-10 text-center">
          <PackageSearch className="h-12 w-12 text-[#9b6819]" />
          <h1 className="mt-5 font-serif text-3xl font-bold text-[#351b12]">Book not found</h1>
          <p className="mt-3 text-[#715240]">
            {loadError || 'This product may have been removed or renamed by the admin.'}
          </p>
          <a href="#catalog" className="primary-button mt-6">
            Back to Collection
          </a>
        </div>
      </section>
    );
  }

  const sku = getProductSku(product);
  const stockState = getStockState(product.stock);
  const description = getProductDescription(product);
  const hasSalePrice = product.mrp > product.price;
  const discount = hasSalePrice ? Math.round(((product.mrp - product.price) / product.mrp) * 100) : 0;
  const quantityDown = () => setQuantity((value) => Math.max(1, value - 1));
  const quantityUp = () => setQuantity((value) => value + 1);
  const addCurrentQuantityToCart = () => {
    if (stockState.available) onAddToCart(product, quantity);
  };
  const whatsappOrderLink = makeWhatsAppLink(
    `Namaste, I would like to enquire about "${product.title}" (${sku || product.category}) for order or bulk availability.`,
  );
  const headerDetails = [
    ['Author', product.author],
    ['Publisher', product.publisher],
    ['Language', product.language],
    ['SKU', sku],
  ].filter(([, value]) => Boolean(value));
  const specifications = [
    ['Title', product.title],
    ['Author', product.author],
    ['Publisher', product.publisher],
    ['Language', product.language],
    ['Category', product.category],
    ['SKU', sku],
    ['Pages', product.pages ? `${product.pages} pages` : ''],
    ['Binding', product.type],
  ].filter(([, value]) => Boolean(value));
  const deliveryItems = [
    {
      icon: Truck,
      title: 'Delivery across India',
      text: 'Orders can be dispatched to customers across India through courier or postal partners.',
    },
    {
      icon: Clock3,
      title: 'Dispatch estimate',
      text: stockState.available ? 'Usually dispatched in 1-2 business days after confirmation.' : 'Dispatch will be confirmed after availability is checked.',
    },
    {
      icon: MessageCircle,
      title: 'Bulk order support',
      text: 'WhatsApp or call for temples, schools, institutions, and reseller quantity enquiries.',
    },
    {
      icon: Store,
      title: 'Store pickup or enquiry',
      text: 'Local customers can enquire directly before visiting the Chickpet bookstore.',
    },
  ];
  const returnItems = [
    'Replacement is available for damaged books or wrong items received.',
    'Please contact support after delivery with order details and photos when needed.',
    'Religious books should be unused and kept in original condition if a return is supported.',
  ];
  const trustReasons = [
    { icon: ShieldCheck, title: 'Authentic spiritual books', text: 'Curated religious, stotra, pooja, scripture, and astrology titles.' },
    { icon: LibraryBig, title: 'Trusted bookstore', text: `${yearsOfLegacy}+ years serving devotees, readers, families, and institutions.` },
    { icon: MessageCircle, title: 'WhatsApp assistance', text: 'Quick help for availability, language, editions, and bulk enquiries.' },
    { icon: PackageCheck, title: 'Carefully packed', text: 'Books are packed with care before dispatch or pickup handover.' },
  ];

  return (
    <section className="bg-[#fffdf8] px-4 pb-32 pt-7 sm:px-6 sm:pt-10 lg:px-8 lg:pb-16">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <a href="#catalog" className="inline-flex items-center gap-2 text-sm font-extrabold text-[#64131d] hover:text-[#9b6819]">
            <ChevronRight className="h-4 w-4 rotate-180" />
            Back to Collection
          </a>
        </div>
        {loadError && (
          <div className="mb-5 border border-[#e8c58b] bg-[#fff7e8] px-4 py-3 text-sm font-semibold text-[#8c4b0b]" role="status">
            {loadError}
          </div>
        )}
        {product.isCatalogPreview && (
          <div className="mb-5 border border-[#e8c58b] bg-[#fff7e8] px-4 py-3 text-sm font-semibold text-[#8c4b0b]" role="status">
            This is a preview catalog listing. Price, stock, delivery timing, and availability must be confirmed with the bookstore.
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[0.82fr_1.05fr_0.78fr] lg:items-start">
          <div className="order-2 border border-[#eadfca] bg-white p-4 shadow-sm shadow-[#64131d]/5 lg:order-1">
            <div className="relative grid min-h-[250px] place-items-center overflow-hidden bg-[#fff4d8] p-5 sm:min-h-[380px] sm:p-8">
              <span className="absolute left-4 top-4 rounded-sm bg-[#fffaf0] px-3 py-1 text-xs font-extrabold uppercase tracking-[0.1em] text-[#8c5f17] shadow-sm">
                {product.badge}
              </span>
              <ProductImage product={product} imageUrl={selectedImage} variant="detail" />
            </div>
            {productImages.length > 1 && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {productImages.map((image) => (
                  <button
                    key={image}
                    type="button"
                    onClick={() => setSelectedImage(image)}
                    className={`grid min-h-20 place-items-center rounded-md border bg-[#fffaf0] p-2 transition ${
                      selectedImage === image ? 'border-[#64131d] shadow-md shadow-[#64131d]/10' : 'border-[#eadfca] hover:border-[#b68b3a]'
                    }`}
                    aria-label={`View image for ${product.title}`}
                  >
                    <ProductImage product={product} imageUrl={image} variant="thumb" />
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 grid grid-cols-3 divide-x divide-[#eadfca] border border-[#eadfca] bg-[#fffdf8] text-center text-xs font-bold text-[#715240]">
              <div className="p-3">
                <PackageCheck className="mx-auto mb-1 h-4 w-4 text-[#9b6819]" />
                Safe packing
              </div>
              <div className="p-3">
                <Truck className="mx-auto mb-1 h-4 w-4 text-[#9b6819]" />
                India delivery
              </div>
              <div className="p-3">
                <MessageCircle className="mx-auto mb-1 h-4 w-4 text-[#1f7a3b]" />
                Bulk help
              </div>
            </div>
          </div>

          <div className="order-1 border border-[#eadfca] bg-white p-5 shadow-sm shadow-[#64131d]/5 sm:p-6 lg:order-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-sm bg-[#fff3d7] px-3 py-1 text-xs font-extrabold uppercase tracking-[0.12em] text-[#8c5f17]">
                {product.category}
              </span>
              <span className={`inline-flex items-center gap-2 rounded-sm border px-3 py-1 text-xs font-extrabold ${stockState.border} ${stockState.background} ${stockState.text}`}>
                <span className={`h-2 w-2 rounded-full ${stockState.dot}`} />
                {product.isCatalogPreview ? 'Availability unconfirmed' : stockState.label}
              </span>
            </div>

            <h1 className="mt-4 font-serif text-3xl font-bold leading-tight text-[#351b12] sm:text-4xl lg:text-[44px]">
              {product.title}
            </h1>
            <p className="mt-3 text-base leading-7 text-[#715240] sm:text-lg">{product.subtitle}</p>

            <div className="mt-5 border border-[#eadfca] bg-[#fffaf0] p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#8a705c]">
                    {product.isCatalogPreview ? 'Preview price' : 'Selling price'}
                  </p>
                  <strong className="mt-1 block text-4xl font-black text-[#64131d]">{formatPrice(product.price)}</strong>
                </div>
                {hasSalePrice && (
                  <>
                    <span className="pb-1 text-lg font-semibold text-[#8a705c] line-through">{formatPrice(product.mrp)}</span>
                    <span className="mb-1 rounded-sm bg-[#eefaf1] px-2 py-1 text-xs font-extrabold text-[#1f7a3b]">{discount}% off</span>
                  </>
                )}
              </div>
              <p className={`mt-3 flex items-center gap-2 text-sm font-bold ${stockState.text}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${stockState.dot}`} />
                {product.isCatalogPreview ? 'Contact the bookstore to confirm current stock.' : `${stockState.label}. ${stockState.note}`}
              </p>
            </div>

            <div className="mt-6 grid gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-extrabold text-[#351b12]">Qty</span>
                <QuantitySelector quantity={quantity} onDecrease={quantityDown} onIncrease={quantityUp} />
              </div>
              <div className="hidden gap-3 sm:grid sm:grid-cols-[1fr_1fr]">
                <button
                  type="button"
                  onClick={addCurrentQuantityToCart}
                  className="primary-button"
                  disabled={!stockState.available}
                >
                  <ShoppingCart className="h-5 w-5" />
                  {stockState.available ? `Add ${quantity} to Cart` : 'Out of Stock'}
                </button>
                <a href={whatsappOrderLink} className="secondary-button border-[#1f7a3b] text-[#1f7a3b] hover:border-[#1f7a3b] hover:bg-[#eefaf1]">
                  <MessageCircle className="h-5 w-5" />
                  WhatsApp Order
                </a>
              </div>
              <div className="hidden sm:block">
                <button type="button" onClick={() => onToggleWishlist(product.id)} className="secondary-button w-full">
                  <Heart className={`h-5 w-5 ${isWishlisted ? 'fill-current' : ''}`} />
                  {isWishlisted ? 'Saved to Wishlist' : 'Add to Wishlist'}
                </button>
              </div>
            </div>

            <div className="mt-5 border-t border-[#eadfca] pt-5">
              <RatingSummary rating={product.rating} reviews={product.reviews} />
              <div className="mt-4 grid gap-2 text-sm text-[#604638] sm:grid-cols-2">
                {headerDetails.map(([label, value]) => (
                  <div key={label} className="flex gap-2">
                    <span className="min-w-20 font-extrabold text-[#351b12]">{label}:</span>
                    <span className="font-semibold">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <ProductInfoPanel title="Why buy from us?" className="order-3">
            <div className="grid gap-4">
              {trustReasons.map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[#fff4d8] text-[#9b6819]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-extrabold text-[#351b12]">{title}</p>
                    <p className="mt-1 text-sm leading-6 text-[#715240]">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </ProductInfoPanel>
        </div>

        <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_0.86fr]">
          <ProductInfoPanel title="Product Description">
            <p className="text-base leading-8 text-[#604638]">{description}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                ['Category', product.category],
                ['Language', product.language],
                ['Publisher', product.publisher],
              ].map(([label, value]) => (
                <div key={label} className="border-l-2 border-[#d68616] bg-[#fffaf0] p-3">
                  <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#8a705c]">{label}</p>
                  <p className="mt-1 font-bold text-[#351b12]">{value}</p>
                </div>
              ))}
            </div>
          </ProductInfoPanel>

          <ProductInfoPanel title="Delivery Information">
            <div className="grid gap-4">
              {deliveryItems.map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex gap-3">
                  <Icon className="mt-1 h-5 w-5 shrink-0 text-[#9b6819]" />
                  <div>
                    <p className="font-extrabold text-[#351b12]">{title}</p>
                    <p className="mt-1 text-sm leading-6 text-[#715240]">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </ProductInfoPanel>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_0.86fr]">
          <ProductInfoPanel title="Book Details">
            <dl className="grid gap-0 overflow-hidden border border-[#eadfca] sm:grid-cols-2">
              {specifications.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[116px_1fr] border-b border-[#eadfca] last:border-b-0 sm:border-r sm:last:border-b sm:even:border-r-0">
                  <dt className="bg-[#fffaf0] px-3 py-3 text-xs font-extrabold uppercase tracking-[0.12em] text-[#8a705c]">
                    {label}
                  </dt>
                  <dd className="px-3 py-3 font-semibold text-[#351b12]">{value}</dd>
                </div>
              ))}
            </dl>
          </ProductInfoPanel>

          <ProductInfoPanel title="Returns & Replacement">
            <div className="grid gap-3">
              {returnItems.map((item) => (
                <div key={item} className="flex gap-3 text-sm leading-6 text-[#604638]">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#1f7a3b]" />
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </ProductInfoPanel>
        </div>

        {relatedProducts.length > 0 && (
          <div className="mt-10">
          <h2 className="font-serif text-3xl font-bold text-[#351b12]">Related Books</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {relatedProducts.map((relatedProduct) => (
              <ProductCard
                key={relatedProduct.id}
                product={relatedProduct}
                isWishlisted={wishlist.includes(relatedProduct.id)}
                onAddToCart={onAddToCart}
                onToggleWishlist={onToggleWishlist}
              />
            ))}
          </div>
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#eadfca] bg-[#fffaf0]/96 px-4 py-3 shadow-[0_-14px_34px_rgba(53,27,18,0.16)] backdrop-blur-lg lg:hidden">
        <div className="mx-auto grid max-w-7xl grid-cols-[1fr_auto_auto] items-center gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-[#715240]">{product.title}</p>
            <p className="text-lg font-black text-[#64131d]">{formatPrice(product.price)}</p>
          </div>
          <button
            type="button"
            onClick={addCurrentQuantityToCart}
            className="primary-button min-h-11 px-3 text-sm"
            disabled={!stockState.available}
          >
            <ShoppingCart className="h-4 w-4" />
            Add to Cart
          </button>
          <a
            href={whatsappOrderLink}
            className="grid h-11 w-11 place-items-center rounded-md border border-[#1f7a3b] bg-white text-[#1f7a3b]"
            aria-label={`WhatsApp enquiry for ${product.title}`}
          >
            <MessageCircle className="h-5 w-5" />
          </a>
        </div>
      </div>
    </section>
  );
}

function AdminLogin({
  onLogin,
  authMode = 'blocked',
  authError = '',
  isAuthenticating = false,
}) {
  const isSupabaseAuth = authMode === 'supabase';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const isConfigured = isSupabaseAuth && canAccessAdmin();
  const displayedError = error || authError;

  const submitLogin = async (event) => {
    event.preventDefault();
    setError('');

    if (!isConfigured) {
      setError('Admin access is temporarily unavailable while server-side authorization is being secured.');
      return;
    }

    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }

    try {
      await onLogin({
        email,
        password,
      });
    } catch (loginError) {
      setError(loginError?.message || 'Could not sign in right now. Please try again.');
    }
  };

  return (
    <section className="min-h-screen overflow-x-hidden bg-[#fff7e8] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-80px)] w-full max-w-5xl place-items-center">
        <div className="grid min-w-0 w-full max-w-[calc(100vw-2rem)] overflow-hidden border border-[#eadfca] bg-white shadow-2xl shadow-[#64131d]/10 lg:max-w-full lg:grid-cols-[0.9fr_1.1fr]">
          <div className="hidden bg-[#64131d] p-10 text-white lg:flex lg:flex-col lg:justify-between">
            <div>
              <span className="grid h-12 w-12 place-items-center rounded-lg bg-[#fffaf0] text-[#64131d]">
                <BookOpen className="h-6 w-6" />
              </span>
              <h1 className="mt-8 font-serif text-4xl font-bold leading-tight">
                T N Krishnaiah Setty & Son Admin
              </h1>
              <p className="mt-4 leading-8 text-[#ffe4bd]">
                Manage bookstore inventory, prices, stock status, and catalog
                details from a private admin area.
              </p>
            </div>
            <p className="text-sm font-semibold text-[#f3c76a]">
              {isSupabaseAuth ? 'Secured admin authorization required.' : 'Admin access is currently blocked.'}
            </p>
          </div>

          <form onSubmit={submitLogin} className="w-full min-w-0 max-w-full p-6 sm:p-10">
            <a href="/" className="inline-flex items-center gap-2 text-sm font-extrabold text-[#64131d] hover:text-[#9b6819]">
              <ChevronRight className="h-4 w-4 rotate-180" />
              Back to Store
            </a>
            <div className="mt-8 flex min-w-0 items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#fff4d8] text-[#64131d]">
                <LockKeyhole className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="font-serif text-3xl font-bold text-[#351b12]">Admin Login</h2>
                <p className="mt-1 max-w-full text-sm leading-6 text-[#715240]">
                  {isSupabaseAuth
                    ? 'Sign in with your Supabase admin email and password.'
                    : 'Admin access will remain disabled until server-side authorization and database policies are repaired.'}
                </p>
              </div>
            </div>

            {!isSupabaseAuth && !isConfigured && (
              <div className="mt-6 border border-[#d9c396] bg-[#fff7e8] p-4 text-sm font-semibold leading-6 text-[#64131d]">
                This page cannot create a local or mock admin session. Public storefront browsing remains available.
              </div>
            )}

            {displayedError && (
              <div className="mt-6 border border-[#e6b8b8] bg-[#fff1f1] p-4 text-sm font-semibold text-[#9b1c2c]">
                {displayedError}
              </div>
            )}

            <div className="mt-6 grid gap-4">
              <label className="grid gap-2 text-sm font-bold text-[#351b12]">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="form-field"
                  autoComplete="email"
                  placeholder="admin@example.com"
                  disabled={!isConfigured}
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-[#351b12]">
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="form-field"
                  autoComplete="current-password"
                  placeholder="Admin password"
                  disabled={!isConfigured}
                />
              </label>
            </div>

            <button type="submit" className="primary-button mt-6 w-full" disabled={isAuthenticating || !isConfigured}>
              <LockKeyhole className="h-5 w-5" />
              {isAuthenticating ? 'Signing in...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

function AdminLayout({ children, onLogout, currentRoute = 'adminProducts' }) {
  const navItems = [
    { href: '/admin/products', label: 'Products', active: currentRoute === 'adminProducts' },
    { href: '/admin/orders', label: 'Orders', active: currentRoute === 'adminOrders' },
  ];

  return (
    <div className="min-h-screen bg-[#fffdf8] text-[#351b12]">
      <header className="border-b border-[#eadfca] bg-[#fffaf0] px-4 py-4 shadow-sm sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <a href="/" className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-[#64131d] text-[#f3c76a]">
              <BookOpen className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-serif text-xl font-bold text-[#351b12]">
                Bookstore Admin
              </span>
              <span className="block text-xs font-bold uppercase tracking-[0.14em] text-[#9b6819]">
                Catalog & Orders
              </span>
            </span>
          </a>
          <nav className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:flex sm:flex-wrap" aria-label="Admin navigation">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`secondary-button px-3 ${item.active ? 'border-[#64131d] bg-[#fff3d7] text-[#64131d]' : ''}`}
                aria-current={item.active ? 'page' : undefined}
              >
                {item.label}
              </a>
            ))}
            <a href="/" className="secondary-button px-3">
              <Store className="h-5 w-5" />
              View Store
            </a>
            <button type="button" onClick={onLogout} className="secondary-button px-3">
              <LogOut className="h-5 w-5" />
              Logout
            </button>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

function AdminLoadingScreen() {
  return (
    <section className="grid min-h-screen place-items-center bg-[#fff7e8] px-4">
      <div className="border border-[#eadfca] bg-white p-8 text-center shadow-xl shadow-[#64131d]/10">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-[#fff4d8] text-[#64131d]">
          <LockKeyhole className="h-5 w-5" />
        </span>
        <h1 className="mt-5 font-serif text-2xl font-bold text-[#351b12]">Checking admin session</h1>
        <p className="mt-2 text-sm font-semibold text-[#715240]">Please wait a moment.</p>
      </div>
    </section>
  );
}

function AdminUnavailable() {
  return (
    <section className="grid min-h-screen place-items-center bg-[#fff7e8] px-4 py-10">
      <div className="w-full max-w-2xl border border-[#eadfca] bg-white p-8 text-center shadow-xl shadow-[#64131d]/10 sm:p-12">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-[#fff4d8] text-[#64131d]">
          <LockKeyhole className="h-6 w-6" />
        </span>
        <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.14em] text-[#9b6819]">Production safety lock</p>
        <h1 className="mt-2 font-serif text-3xl font-bold text-[#351b12]">Admin access is temporarily unavailable</h1>
        <p className="mx-auto mt-4 max-w-xl leading-7 text-[#715240]">
          Product and order administration is blocked until server-side authorization and Supabase row-level security are repaired and reviewed.
        </p>
        <a href="/" className="primary-button mx-auto mt-7 w-full sm:w-fit">
          <Store className="h-5 w-5" />
          Return to Storefront
        </a>
      </div>
    </section>
  );
}

function AdminProducts({
  productsList,
  isLoading = false,
  loadError = '',
  isSaving = false,
  onSaveProduct,
  onQuickUpdate,
  onDeleteProduct,
  onResetCatalog,
}) {
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(emptyProductForm);
  const [notice, setNotice] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploadNotice, setUploadNotice] = useState('');
  const [isCoverUploading, setIsCoverUploading] = useState(false);
  const [isGalleryUploading, setIsGalleryUploading] = useState(false);
  const galleryImageUrls = useMemo(() => parseImageList(form.galleryImagesText), [form.galleryImagesText]);
  const isUploadingImage = isCoverUploading || isGalleryUploading;
  const previewProduct = normalizeProduct({
    ...form,
    title: form.title || 'New Book',
    galleryImages: galleryImageUrls,
  });

  const filteredAdminProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return productsList;
    return productsList.filter((product) =>
      [product.title, product.author, product.publisher, product.category, product.language]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [productsList, query]);

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setUploadError('');
  };

  const resetForm = () => {
    setEditingId('');
    setForm(emptyProductForm);
    setNotice('');
    setUploadError('');
    setUploadNotice('');
  };

  const editProduct = (product) => {
    setEditingId(product.id);
    setForm(toProductForm(product));
    setNotice(`Editing ${product.title}`);
    setUploadError('');
    setUploadNotice('');
  };

  const getUploadProductKey = () => editingId || form.id || slugify(form.title || 'new-product');

  const uploadCoverFile = async (file) => {
    if (!file) return;

    setUploadError('');
    setUploadNotice('');
    setIsCoverUploading(true);

    try {
      const uploadedImage = await uploadProductImage(file, {
        productSlugOrId: getUploadProductKey(),
      });

      setForm((current) => ({
        ...current,
        coverImageUrl: uploadedImage.publicUrl,
        imageAlt: current.imageAlt || `${current.title || 'Product'} cover image`,
      }));
      setUploadNotice('Cover image uploaded.');
    } catch (error) {
      setUploadError(error?.message || 'Could not upload the cover image.');
    } finally {
      setIsCoverUploading(false);
    }
  };

  const uploadGalleryFiles = async (files) => {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return;

    setUploadError('');
    setUploadNotice('');
    setIsGalleryUploading(true);

    try {
      const uploadedImages = await Promise.all(
        selectedFiles.map((file) =>
          uploadProductImage(file, {
            productSlugOrId: getUploadProductKey(),
          }),
        ),
      );
      const uploadedUrls = uploadedImages.map((image) => image.publicUrl).filter(Boolean);

      setForm((current) => ({
        ...current,
        galleryImagesText: getGalleryTextFromUrls([
          ...parseImageList(current.galleryImagesText),
          ...uploadedUrls,
        ]),
      }));
      setUploadNotice(`${uploadedUrls.length} gallery image${uploadedUrls.length === 1 ? '' : 's'} uploaded.`);
    } catch (error) {
      setUploadError(error?.message || 'Could not upload gallery images.');
    } finally {
      setIsGalleryUploading(false);
    }
  };

  const removeGalleryImage = (imageUrl) => {
    setForm((current) => ({
      ...current,
      galleryImagesText: getGalleryTextFromUrls(
        parseImageList(current.galleryImagesText).filter((item) => item !== imageUrl),
      ),
    }));
  };

  const submitProduct = async (event) => {
    event.preventDefault();

    if (isUploadingImage) {
      setUploadError('Please wait for image upload to finish before saving.');
      return;
    }

    try {
      const savedProduct = await onSaveProduct({
        ...form,
        id: editingId || form.id,
      });
      setEditingId(savedProduct.id);
      setForm(toProductForm(savedProduct));
      setNotice(savedProduct.syncMessage || `${savedProduct.title} saved.`);
    } catch (error) {
      setNotice(error?.message || adminProductWriteErrorMessage);
    }
  };

  return (
    <section className="bg-[#fffdf8] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <a href="/" className="inline-flex items-center gap-2 text-sm font-extrabold text-[#64131d] hover:text-[#9b6819]">
              <ChevronRight className="h-4 w-4 rotate-180" />
              Back to Store
            </a>
            <h1 className="mt-4 font-serif text-4xl font-bold text-[#351b12]">Product Admin</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[#715240]">
              Add new books, edit product details, update prices, change stock
              status, and manage categories. {isSupabaseConfigured
                ? 'Changes are saved to the connected Supabase catalog.'
                : 'Demo mode: Admin database features require Supabase configuration. Changes stay on this device.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={resetForm} className="secondary-button" disabled={isSaving}>
              <Plus className="h-5 w-5" />
              New Product
            </button>
            <button type="button" onClick={onResetCatalog} className="secondary-button" disabled={isSaving}>
              Restore Starter Catalog
            </button>
          </div>
        </div>
        {!isSupabaseConfigured && (
          <div className="mb-5 border border-[#e8c58b] bg-[#fff7e8] px-4 py-3 text-sm font-semibold text-[#8c4b0b]" role="status">
            Admin database features require Supabase configuration.
          </div>
        )}
        {(isLoading || loadError) && (
          <div className={`mb-5 border px-4 py-3 text-sm font-semibold ${
            loadError
              ? 'border-[#e8c58b] bg-[#fff7e8] text-[#8c4b0b]'
              : 'border-[#eadfca] bg-white text-[#715240]'
          }`} role="status">
            {loadError || 'Loading product catalog...'}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
          <div className="border border-[#eadfca] bg-white">
            <div className="flex flex-col gap-3 border-b border-[#eadfca] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-serif text-2xl font-bold text-[#351b12]">Inventory</h2>
                <p className="mt-1 text-sm text-[#715240]">{productsList.length} products in the website catalog</p>
              </div>
              <div className="relative sm:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a705c]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="form-field pl-9"
                  placeholder="Search inventory"
                />
              </div>
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Price</th>
                    <th>MRP</th>
                    <th>Stock</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAdminProducts.map((product) => (
                    <tr key={product.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <ProductImage product={product} variant="mini" />
                          <div>
                            <a href={`/#product/${product.id}`} className="font-serif text-lg font-bold text-[#351b12] hover:text-[#64131d]">
                              {product.title}
                            </a>
                            <p className="text-sm text-[#715240]">{product.category} / {product.language}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          value={product.price}
                          onChange={(event) => onQuickUpdate(product.id, { price: Number(event.target.value) })}
                          className="admin-number"
                          aria-label={`Price for ${product.title}`}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          value={product.mrp}
                          onChange={(event) => onQuickUpdate(product.id, { mrp: Number(event.target.value) })}
                          className="admin-number"
                          aria-label={`MRP for ${product.title}`}
                        />
                      </td>
                      <td>
                        <select
                          value={product.stock}
                          onChange={(event) => onQuickUpdate(product.id, { stock: event.target.value })}
                          className="admin-select"
                          aria-label={`Stock for ${product.title}`}
                        >
                          <option>In stock</option>
                          <option>Limited stock</option>
                          <option>Out of stock</option>
                          <option>Preorder</option>
                        </select>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => editProduct(product)} className="admin-small-button">
                            Edit
                          </button>
                          <button type="button" onClick={() => onDeleteProduct(product.id)} className="admin-small-button danger">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 p-4 lg:hidden">
              {filteredAdminProducts.length > 0 ? (
                filteredAdminProducts.map((product) => (
                  <AdminProductMobileCard
                    key={product.id}
                    product={product}
                    onQuickUpdate={onQuickUpdate}
                    onEdit={() => editProduct(product)}
                    onDelete={() => onDeleteProduct(product.id)}
                  />
                ))
              ) : (
                <div className="grid min-h-48 place-items-center border border-dashed border-[#d9c396] bg-[#fffdf8] p-6 text-center">
                  <div>
                    <PackageSearch className="mx-auto h-10 w-10 text-[#9b6819]" />
                    <p className="mt-3 font-serif text-xl font-bold text-[#351b12]">No products matched</p>
                    <p className="mt-1 text-sm text-[#715240]">Try another product title, category, language, or publisher.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <form onSubmit={submitProduct} className="min-w-0 border border-[#eadfca] bg-[#fffaf0] p-4 shadow-sm sm:p-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-serif text-2xl font-bold text-[#351b12]">
                  {editingId ? 'Edit Product' : 'Add Product'}
                </h2>
                {notice && <p className="mt-1 text-sm font-semibold text-[#1f7a3b]">{notice}</p>}
                {uploadNotice && <p className="mt-1 text-sm font-semibold text-[#1f7a3b]">{uploadNotice}</p>}
              </div>
              <ProductImage product={previewProduct} variant="mini" />
            </div>

            <div className="grid gap-4">
              <AdminField label="Product Title" value={form.title} onChange={(value) => updateForm('title', value)} required />
              <AdminField label="Subtitle" value={form.subtitle} onChange={(value) => updateForm('subtitle', value)} />
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <AdminField label="Selling Price" type="number" value={form.price} onChange={(value) => updateForm('price', value)} />
                <AdminField label="Printed MRP" type="number" value={form.mrp} onChange={(value) => updateForm('mrp', value)} />
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <AdminSelect label="Category" value={form.category} onChange={(value) => updateForm('category', value)} options={categoryFilters} />
                <AdminSelect label="Language" value={form.language} onChange={(value) => updateForm('language', value)} options={languages} />
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <AdminSelect label="Publisher" value={form.publisher} onChange={(value) => updateForm('publisher', value)} options={publishers} />
                <AdminSelect label="Book Type" value={form.type} onChange={(value) => updateForm('type', value)} options={bookTypes} />
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <AdminField label="Author" value={form.author} onChange={(value) => updateForm('author', value)} />
                <AdminField label="ISBN" value={form.isbn} onChange={(value) => updateForm('isbn', value)} />
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <AdminField label="Pages" type="number" value={form.pages} onChange={(value) => updateForm('pages', value)} />
                <AdminField label="Badge" value={form.badge} onChange={(value) => updateForm('badge', value)} />
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <AdminSelect label="Stock" value={form.stock} onChange={(value) => updateForm('stock', value)} options={['In stock', 'Limited stock', 'Out of stock', 'Preorder']} />
                <AdminSelect label="Cover Style" value={form.cover} onChange={(value) => updateForm('cover', value)} options={coverOptions} />
              </div>

              <section className="admin-upload-panel">
                <div className="admin-upload-preview">
                  <ProductImage product={previewProduct} imageUrl={form.coverImageUrl} variant="detail" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black uppercase tracking-[0.12em] text-[#8a5f18]">Cover image</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[#715240]">
                    JPG, PNG, or WebP under 5 MB.
                  </p>
                  <div className="mt-4 grid gap-3">
                    <label className={`admin-upload-button ${!isSupabaseConfigured || isCoverUploading ? 'is-disabled' : ''}`}>
                      <UploadCloud className="h-5 w-5" />
                      <span>{isCoverUploading ? 'Uploading cover...' : form.coverImageUrl ? 'Replace cover image' : 'Upload cover image'}</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={!isSupabaseConfigured || isCoverUploading}
                        onChange={(event) => {
                          uploadCoverFile(event.target.files?.[0]);
                          event.target.value = '';
                        }}
                      />
                    </label>
                    {!isSupabaseConfigured && (
                      <p className="text-xs font-semibold leading-5 text-[#9b1c2c]">
                        Supabase is required for uploads. Paste an image URL below while Supabase is unavailable.
                      </p>
                    )}
                  </div>
                </div>
              </section>

              {uploadError && (
                <div className="border border-[#e6b8b8] bg-[#fff1f1] px-4 py-3 text-sm font-semibold text-[#9b1c2c]" role="status">
                  {uploadError}
                </div>
              )}

              <AdminField label="Cover Image URL (manual fallback)" value={form.coverImageUrl} onChange={(value) => updateForm('coverImageUrl', value)} />
              <AdminField label="Image Alt Text" value={form.imageAlt} onChange={(value) => updateForm('imageAlt', value)} />

              <section className="admin-gallery-panel">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.12em] text-[#8a5f18]">Gallery images</p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-[#715240]">
                      Optional page or back-cover photos for the product detail page.
                    </p>
                  </div>
                  <label className={`admin-upload-button compact ${!isSupabaseConfigured || isGalleryUploading ? 'is-disabled' : ''}`}>
                    <UploadCloud className="h-5 w-5" />
                    <span>{isGalleryUploading ? 'Uploading...' : 'Add gallery images'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      disabled={!isSupabaseConfigured || isGalleryUploading}
                      onChange={(event) => {
                        uploadGalleryFiles(event.target.files);
                        event.target.value = '';
                      }}
                    />
                  </label>
                </div>

                {galleryImageUrls.length > 0 ? (
                  <div className="admin-gallery-grid">
                    {galleryImageUrls.map((imageUrl) => (
                      <div key={imageUrl} className="admin-gallery-thumb">
                        <ProductImage product={previewProduct} imageUrl={imageUrl} variant="thumb" />
                        <button
                          type="button"
                          onClick={() => removeGalleryImage(imageUrl)}
                          aria-label="Remove gallery image"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="admin-gallery-empty">
                    Gallery images will appear here after upload or manual URL entry.
                  </div>
                )}
              </section>

              <label className="grid gap-2 text-sm font-bold text-[#351b12]">
                Gallery Image URLs (manual fallback)
                <textarea
                  value={form.galleryImagesText}
                  onChange={(event) => updateForm('galleryImagesText', event.target.value)}
                  rows="3"
                  className="form-field resize-none"
                  placeholder="One image URL per line, or comma-separated"
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-[#351b12]">
                Categories / Tags
                <textarea
                  value={form.categoriesText}
                  onChange={(event) => updateForm('categoriesText', event.target.value)}
                  rows="3"
                  className="form-field resize-none"
                  placeholder="Devotional, Bhagavadgita, Religion & Spirituality"
                />
              </label>
            </div>

            <button type="submit" className="primary-button mt-5 w-full" disabled={isSaving || isUploadingImage}>
              <Save className="h-5 w-5" />
              {isUploadingImage ? 'Uploading image...' : isSaving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Product'}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

function AdminProductMobileCard({ product, onQuickUpdate, onEdit, onDelete }) {
  return (
    <article data-admin-mobile-card="true" className="border border-[#eadfca] bg-[#fffdf8] p-4 shadow-sm shadow-[#64131d]/5">
      <div className="grid grid-cols-[64px_1fr] gap-3">
        <div className="grid min-h-24 place-items-center rounded-md bg-[#fff4d8] p-2">
          <ProductImage product={product} variant="mini" />
        </div>
        <div className="min-w-0">
          <a href={`/#product/${product.id}`} className="font-serif text-lg font-bold leading-snug text-[#351b12] hover:text-[#64131d]">
            {product.title}
          </a>
          <p className="mt-1 text-sm font-semibold leading-5 text-[#715240]">
            {product.category} / {product.language}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-md border border-[#eadfca] bg-white p-2">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#8a705c]">Price</p>
              <p className="mt-1 text-lg font-black text-[#64131d]">{formatPrice(product.price)}</p>
            </div>
            <div className="rounded-md border border-[#eadfca] bg-white p-2">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#8a705c]">MRP</p>
              <p className="mt-1 text-lg font-black text-[#351b12]">{formatPrice(product.mrp)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <label className="grid gap-2 text-sm font-bold text-[#351b12]">
          Stock status
          <select
            value={product.stock}
            onChange={(event) => onQuickUpdate(product.id, { stock: event.target.value })}
            className="form-field"
            aria-label={`Stock for ${product.title}`}
          >
            <option>In stock</option>
            <option>Limited stock</option>
            <option>Out of stock</option>
            <option>Preorder</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onEdit} className="admin-small-button min-h-11">
            Edit
          </button>
          <button type="button" onClick={onDelete} className="admin-small-button danger min-h-11">
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

function AdminOrders({
  ordersList,
  isLoading = false,
  loadError = '',
  isUpdating = '',
  onReload,
  onUpdateOrderStatus,
  onUpdatePaymentStatus,
}) {
  const [orderQuery, setOrderQuery] = useState('');
  const [phoneQuery, setPhoneQuery] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [selectedOrderKey, setSelectedOrderKey] = useState('');
  const [notice, setNotice] = useState('');

  const getOrderKey = (order) => order.orderNumber || order.id;

  const filteredOrders = useMemo(() => {
    const normalizedOrderQuery = orderQuery.trim().toLowerCase();
    const normalizedPhoneQuery = phoneQuery.trim().toLowerCase();

    return ordersList.filter((order) => {
      const matchesOrder =
        !normalizedOrderQuery ||
        [order.orderNumber, order.id]
          .join(' ')
          .toLowerCase()
          .includes(normalizedOrderQuery);
      const matchesPhone =
        !normalizedPhoneQuery ||
        String(order.customer?.phone || '')
          .toLowerCase()
          .includes(normalizedPhoneQuery);
      const matchesOrderStatus = !orderStatusFilter || order.orderStatus === orderStatusFilter;
      const matchesPaymentStatus = !paymentStatusFilter || order.paymentStatus === paymentStatusFilter;

      return matchesOrder && matchesPhone && matchesOrderStatus && matchesPaymentStatus;
    });
  }, [orderQuery, ordersList, orderStatusFilter, paymentStatusFilter, phoneQuery]);

  useEffect(() => {
    if (!filteredOrders.length) {
      setSelectedOrderKey('');
      return;
    }

    if (!filteredOrders.some((order) => getOrderKey(order) === selectedOrderKey)) {
      setSelectedOrderKey(getOrderKey(filteredOrders[0]));
    }
  }, [filteredOrders, selectedOrderKey]);

  const selectedOrder =
    ordersList.find((order) => getOrderKey(order) === selectedOrderKey) ||
    filteredOrders[0] ||
    null;
  const hasFilters = orderQuery || phoneQuery || orderStatusFilter || paymentStatusFilter;
  const hasAnyOrders = ordersList.length > 0;

  const clearFilters = () => {
    setOrderQuery('');
    setPhoneQuery('');
    setOrderStatusFilter('');
    setPaymentStatusFilter('');
  };

  const updateOrderStatus = async (order, status) => {
    setNotice('');

    try {
      await onUpdateOrderStatus(order.id || order.orderNumber, status);
      setNotice(`${order.orderNumber} order status updated to ${formatStatusLabel(status)}.`);
    } catch (error) {
      setNotice(error?.message || 'Could not update order status.');
    }
  };

  const updatePaymentStatus = async (order, status) => {
    setNotice('');

    try {
      await onUpdatePaymentStatus(order.id || order.orderNumber, status);
      setNotice(`${order.orderNumber} payment status updated to ${formatStatusLabel(status)}.`);
    } catch (error) {
      setNotice(error?.message || 'Could not update payment status.');
    }
  };

  return (
    <section className="bg-[#fffdf8] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <a href="/" className="inline-flex items-center gap-2 text-sm font-extrabold text-[#64131d] hover:text-[#9b6819]">
              <ChevronRight className="h-4 w-4 rotate-180" />
              Back to Store
            </a>
            <h1 className="mt-4 font-serif text-4xl font-bold text-[#351b12]">Orders</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[#715240]">
              Review customer order requests, confirm payment, update packing
              progress, and follow up on WhatsApp when needed.
            </p>
          </div>
          <button type="button" onClick={onReload} className="secondary-button w-full sm:w-fit" disabled={isLoading}>
            <Clock3 className="h-5 w-5" />
            {isLoading ? 'Loading...' : 'Refresh Orders'}
          </button>
        </div>

        {!isSupabaseConfigured && (
          <div className="mb-5 border border-[#e8c58b] bg-[#fff7e8] px-4 py-3 text-sm font-semibold text-[#8c4b0b]" role="status">
            Admin database features require Supabase configuration.
          </div>
        )}

        {(isLoading || loadError || notice) && (
          <div
            className={`mb-5 border px-4 py-3 text-sm font-semibold ${
              loadError
                ? 'border-[#e8b8b8] bg-[#fff1f1] text-[#9b1c2c]'
                : notice
                  ? 'border-[#9fd7a8] bg-[#eefaf1] text-[#1f7a3b]'
                  : 'border-[#eadfca] bg-white text-[#715240]'
            }`}
            role="status"
          >
            {loadError || notice || 'Loading orders...'}
          </div>
        )}

        <div className="mb-6 border border-[#eadfca] bg-white p-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_220px_220px_auto] xl:items-end">
            <label className="grid gap-2 text-sm font-bold text-[#351b12]">
              Order number
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a705c]" />
                <input
                  value={orderQuery}
                  onChange={(event) => setOrderQuery(event.target.value)}
                  className="form-field pl-9"
                  placeholder="Search TNK order"
                />
              </div>
            </label>
            <label className="grid gap-2 text-sm font-bold text-[#351b12]">
              Customer phone
              <input
                value={phoneQuery}
                onChange={(event) => setPhoneQuery(event.target.value)}
                className="form-field"
                placeholder="Search phone / WhatsApp"
              />
            </label>
            <label className="grid gap-2 text-sm font-bold text-[#351b12]">
              Order status
              <select value={orderStatusFilter} onChange={(event) => setOrderStatusFilter(event.target.value)} className="form-field">
                <option value="">All order statuses</option>
                {orderStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {formatStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-bold text-[#351b12]">
              Payment status
              <select value={paymentStatusFilter} onChange={(event) => setPaymentStatusFilter(event.target.value)} className="form-field">
                <option value="">All payment statuses</option>
                {paymentStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {formatStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={clearFilters} className="secondary-button w-full" disabled={!hasFilters}>
              Clear
            </button>
          </div>
        </div>

        {!isLoading && !hasAnyOrders ? (
          <AdminOrdersEmptyState title="No orders yet" text="Customer checkout requests will appear here as soon as orders are placed." />
        ) : !isLoading && !filteredOrders.length ? (
          <AdminOrdersEmptyState title="No matching orders" text="Try a different order number, phone number, or status filter." />
        ) : (
          <div className="grid gap-6 xl:grid-cols-[1fr_430px]">
            <div className="min-w-0 border border-[#eadfca] bg-white">
              <div className="flex flex-col gap-2 border-b border-[#eadfca] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-serif text-2xl font-bold text-[#351b12]">Order Queue</h2>
                  <p className="mt-1 text-sm text-[#715240]">
                    {filteredOrders.length} of {ordersList.length} order{ordersList.length === 1 ? '' : 's'} shown
                  </p>
                </div>
              </div>

              <div className="hidden overflow-x-auto lg:block">
                <table className="admin-table admin-orders-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Customer</th>
                      <th>Phone</th>
                      <th>City</th>
                      <th>Total</th>
                      <th>Payment</th>
                      <th>Payment Status</th>
                      <th>Order Status</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order) => (
                      <AdminOrderTableRow
                        key={getOrderKey(order)}
                        order={order}
                        selected={selectedOrder && getOrderKey(selectedOrder) === getOrderKey(order)}
                        onSelect={() => setSelectedOrderKey(getOrderKey(order))}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-4 p-4 lg:hidden">
                {filteredOrders.map((order) => (
                  <AdminOrderMobileCard
                    key={getOrderKey(order)}
                    order={order}
                    selected={selectedOrder && getOrderKey(selectedOrder) === getOrderKey(order)}
                    onSelect={() => setSelectedOrderKey(getOrderKey(order))}
                  />
                ))}
              </div>
            </div>

            <AdminOrderDetail
              order={selectedOrder}
              isUpdating={isUpdating}
              onUpdateOrderStatus={updateOrderStatus}
              onUpdatePaymentStatus={updatePaymentStatus}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function AdminOrdersEmptyState({ title, text }) {
  return (
    <div className="grid min-h-80 place-items-center border border-dashed border-[#d9c396] bg-white p-8 text-center">
      <div>
        <PackageSearch className="mx-auto h-12 w-12 text-[#9b6819]" />
        <h2 className="mt-4 font-serif text-2xl font-bold text-[#351b12]">{title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#715240]">{text}</p>
      </div>
    </div>
  );
}

function AdminOrderTableRow({ order, selected, onSelect }) {
  return (
    <tr className={selected ? 'bg-[#fff7e8]' : ''}>
      <td>
        <button type="button" onClick={onSelect} className="text-left font-serif text-lg font-bold text-[#64131d] hover:text-[#9b6819]">
          {order.orderNumber}
        </button>
      </td>
      <td className="font-semibold text-[#351b12]">{order.customer.fullName || 'Customer'}</td>
      <td>{order.customer.phone || 'Not provided'}</td>
      <td>{[order.customer.city, order.customer.pincode].filter(Boolean).join(' / ') || 'Not provided'}</td>
      <td className="font-black text-[#64131d]">{formatPrice(order.total)}</td>
      <td>{getPaymentMethodLabel(order.paymentMethod)}</td>
      <td><StatusPill label={formatStatusLabel(order.paymentStatus)} className={getPaymentStatusClass(order.paymentStatus)} /></td>
      <td><StatusPill label={formatStatusLabel(order.orderStatus)} className={getOrderStatusClass(order.orderStatus)} /></td>
      <td>{formatDateTime(order.createdAt)}</td>
    </tr>
  );
}

function AdminOrderMobileCard({ order, selected, onSelect }) {
  return (
    <article className={`border p-4 shadow-sm ${selected ? 'border-[#64131d] bg-[#fff7e8]' : 'border-[#eadfca] bg-[#fffdf8]'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-serif text-xl font-bold text-[#64131d]">{order.orderNumber}</p>
          <p className="mt-1 text-sm font-semibold text-[#351b12]">{order.customer.fullName || 'Customer'}</p>
          <p className="mt-1 text-sm text-[#715240]">{order.customer.phone || 'No phone'} · {[order.customer.city, order.customer.pincode].filter(Boolean).join(' / ') || 'No city'}</p>
        </div>
        <strong className="shrink-0 text-lg text-[#64131d]">{formatPrice(order.total)}</strong>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <StatusPill label={formatStatusLabel(order.orderStatus)} className={getOrderStatusClass(order.orderStatus)} />
        <StatusPill label={formatStatusLabel(order.paymentStatus)} className={getPaymentStatusClass(order.paymentStatus)} />
      </div>

      <div className="mt-4 grid gap-3 text-sm text-[#604638]">
        <div className="flex justify-between gap-3">
          <span>Payment</span>
          <strong>{getPaymentMethodLabel(order.paymentMethod)}</strong>
        </div>
        <div className="flex justify-between gap-3">
          <span>Created</span>
          <strong>{formatDateTime(order.createdAt)}</strong>
        </div>
      </div>

      <button type="button" onClick={onSelect} className="admin-small-button mt-4 w-full min-h-11">
        View Details
      </button>
    </article>
  );
}

function StatusPill({ label, className }) {
  return (
    <span className={`inline-flex min-h-8 items-center justify-center rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.08em] ${className}`}>
      {label}
    </span>
  );
}

function AdminOrderDetail({ order, isUpdating, onUpdateOrderStatus, onUpdatePaymentStatus }) {
  if (!order) {
    return (
      <aside className="border border-[#eadfca] bg-[#fffaf0] p-5">
        <PackageSearch className="h-10 w-10 text-[#9b6819]" />
        <h2 className="mt-4 font-serif text-2xl font-bold text-[#351b12]">Select an order</h2>
        <p className="mt-2 text-sm leading-6 text-[#715240]">
          Choose an order from the list to review customer details, line items,
          payment state, and fulfillment progress.
        </p>
      </aside>
    );
  }

  const orderStatusUpdating = isUpdating === `${order.id || order.orderNumber}:order`;
  const paymentStatusUpdating = isUpdating === `${order.id || order.orderNumber}:payment`;

  return (
    <aside className="min-w-0 border border-[#eadfca] bg-[#fffaf0] p-4 shadow-sm sm:p-5 xl:sticky xl:top-6 xl:self-start">
      <div className="border-b border-[#eadfca] pb-4">
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#9b6819]">Order details</p>
        <h2 className="mt-2 font-serif text-3xl font-bold text-[#351b12]">{order.orderNumber}</h2>
        <p className="mt-1 text-sm font-semibold text-[#715240]">{formatDateTime(order.createdAt)}</p>
      </div>

      <div className="mt-5 grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <label className="grid gap-2 text-sm font-bold text-[#351b12]">
            Order status
            <select
              value={order.orderStatus}
              onChange={(event) => onUpdateOrderStatus(order, event.target.value)}
              className="form-field"
              disabled={Boolean(isUpdating)}
            >
              {orderStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {formatStatusLabel(status)}
                </option>
              ))}
            </select>
            {orderStatusUpdating && <span className="text-xs text-[#715240]">Updating order status...</span>}
          </label>
          <label className="grid gap-2 text-sm font-bold text-[#351b12]">
            Payment status
            <select
              value={order.paymentStatus}
              onChange={(event) => onUpdatePaymentStatus(order, event.target.value)}
              className="form-field"
              disabled={Boolean(isUpdating)}
            >
              {paymentStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {formatStatusLabel(status)}
                </option>
              ))}
            </select>
            {paymentStatusUpdating && <span className="text-xs text-[#715240]">Updating payment status...</span>}
          </label>
        </div>

        <section className="border border-[#eadfca] bg-white p-4">
          <h3 className="font-serif text-xl font-bold text-[#351b12]">Customer</h3>
          <div className="mt-3 grid gap-2 text-sm">
            <OrderDetailRow label="Name" value={order.customer.fullName || 'Not provided'} />
            <OrderDetailRow label="Phone" value={order.customer.phone || 'Not provided'} />
            {order.customer.email && <OrderDetailRow label="Email" value={order.customer.email} />}
            <OrderDetailRow label="Address" value={order.customer.address || 'Not provided'} />
            <OrderDetailRow label="City" value={order.customer.city || 'Not provided'} />
            <OrderDetailRow label="State" value={order.customer.state || 'Not provided'} />
            <OrderDetailRow label="Pincode" value={order.customer.pincode || 'Not provided'} />
            {order.customer.notes && <OrderDetailRow label="Notes" value={order.customer.notes} />}
          </div>
        </section>

        <section className="border border-[#eadfca] bg-white p-4">
          <h3 className="font-serif text-xl font-bold text-[#351b12]">Payment</h3>
          <div className="mt-3 grid gap-2 text-sm">
            <OrderDetailRow label="Method" value={getPaymentMethodLabel(order.paymentMethod)} />
            <OrderDetailRow label="Payment status" value={formatStatusLabel(order.paymentStatus)} />
            <OrderDetailRow label="Order status" value={formatStatusLabel(order.orderStatus)} />
          </div>
        </section>

        <section className="border border-[#eadfca] bg-white p-4">
          <h3 className="font-serif text-xl font-bold text-[#351b12]">Items</h3>
          <div className="mt-3 grid gap-3">
            {order.items.length ? (
              order.items.map((item) => (
                <div key={item.id || `${item.title}-${item.quantity}`} className="border border-[#eadfca] bg-[#fffdf8] p-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-[#351b12]">{item.title || 'Book'}</p>
                      {(item.sku || item.isbn) && <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#8a705c]">SKU {item.sku || item.isbn}</p>}
                    </div>
                    <strong className="shrink-0 text-[#64131d]">{formatPrice((Number(item.price) || 0) * (Number(item.quantity) || 1))}</strong>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-[#604638]">
                    <span>Qty: <strong>{item.quantity}</strong></span>
                    <span>Price: <strong>{formatPrice(item.price)}</strong></span>
                    <span>Total: <strong>{formatPrice((Number(item.price) || 0) * (Number(item.quantity) || 1))}</strong></span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-[#715240]">No order items were stored for this request.</p>
            )}
          </div>
        </section>

        <section className="border border-[#eadfca] bg-white p-4">
          <h3 className="font-serif text-xl font-bold text-[#351b12]">Totals</h3>
          <div className="mt-3 grid gap-2 text-sm">
            <SummaryRow label="Subtotal" value={formatPrice(order.subtotal)} />
            <SummaryRow label="Shipping fee" value={order.shipping ? formatPrice(order.shipping) : 'Free'} />
            <SummaryRow label="Discount" value={order.discount ? formatPrice(order.discount) : formatPrice(0)} />
            <SummaryRow label="Total" value={formatPrice(order.total)} strong />
          </div>
        </section>

        {order.whatsappMessage && (
          <section className="border border-[#eadfca] bg-white p-4">
            <h3 className="font-serif text-xl font-bold text-[#351b12]">WhatsApp Message</h3>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[#604638]">{order.whatsappMessage}</p>
          </section>
        )}
      </div>
    </aside>
  );
}

function OrderDetailRow({ label, value }) {
  return (
    <div className="grid gap-1 border-b border-[#f0e2c8] pb-2 last:border-b-0 last:pb-0">
      <span className="text-xs font-black uppercase tracking-[0.1em] text-[#8a705c]">{label}</span>
      <span className="break-words font-semibold text-[#351b12]">{value}</span>
    </div>
  );
}

function AdminField({ label, value, onChange, type = 'text', required = false }) {
  return (
    <label className="grid min-w-0 gap-2 text-sm font-bold text-[#351b12]">
      {label}
      <input
        type={type}
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="form-field"
      />
    </label>
  );
}

function AdminSelect({ label, value, onChange, options }) {
  return (
    <label className="grid min-w-0 gap-2 text-sm font-bold text-[#351b12]">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="form-field">
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function CartDrawer({ isOpen, cartItems, onClose, onAdd, onRemove, onDelete, onCheckout, checkoutDisabled = false }) {
  const { subtotal, shipping, total } = getOrderTotals(cartItems);
  const cartWhatsAppLink = makeWhatsAppLink(makeCartWhatsAppMessage(cartItems));

  return (
    <div className={`fixed inset-0 z-50 ${isOpen ? '' : 'pointer-events-none'}`}>
      <div
        className={`absolute inset-0 bg-[#20100c]/55 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <aside className={`absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-[#fffaf0] shadow-2xl transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#eadfca] bg-[#fffaf0] px-5 py-4">
          <h2 className="font-serif text-2xl font-bold text-[#351b12]">Shopping Cart</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full border border-[#d9c396]"
            aria-label="Close cart"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {cartItems.length ? (
          <div className="p-5">
            <div className="grid gap-4">
              {cartItems.map((item) => (
                <div key={item.id} className="grid grid-cols-[70px_1fr] gap-4 border border-[#eadfca] bg-white p-3">
                  <ProductImage product={item} variant="mini" />
                  <div className="min-w-0">
                    <div className="flex justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-serif text-lg font-bold text-[#351b12]">{item.title}</h3>
                        <p className="text-sm text-[#715240]">{formatPrice(item.price)}</p>
                        <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[#8a705c]">
                          Qty: {item.quantity}
                        </p>
                      </div>
                      <button type="button" onClick={() => onDelete(item.id)} className="text-[#9b1c2c]" aria-label="Remove item">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center border border-[#d9c396]">
                        <button type="button" onClick={() => onRemove(item.id)} className="grid h-9 w-9 place-items-center">
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="grid h-9 min-w-10 place-items-center border-x border-[#d9c396] text-sm font-bold">
                          {item.quantity}
                        </span>
                        <button type="button" onClick={() => onAdd(item)} className="grid h-9 w-9 place-items-center">
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      <strong className="text-[#64131d]">{formatPrice(item.price * item.quantity)}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 border border-[#eadfca] bg-white p-5">
              <div className="grid gap-3 text-sm">
                <SummaryRow label="Subtotal" value={formatPrice(subtotal)} />
                <SummaryRow label="Shipping" value={shipping ? formatPrice(shipping) : 'Free'} />
                <SummaryRow label="Total" value={formatPrice(total)} strong />
              </div>
              <button type="button" onClick={onCheckout} className="primary-button mt-5 w-full" disabled={checkoutDisabled}>
                <CreditCard className="h-5 w-5" />
                {checkoutDisabled ? 'Online Checkout Unavailable' : 'Checkout'}
              </button>
              {checkoutDisabled && (
                <p className="mt-3 text-sm font-semibold leading-6 text-[#8c4b0b]">
                  Cart totals are previews only. Please confirm current price, stock, and delivery directly with the bookstore.
                </p>
              )}
              <a href={cartWhatsAppLink} className="secondary-button mt-3 w-full">
                <MessageCircle className="h-5 w-5" />
                Confirm Cart on WhatsApp
              </a>
            </div>
          </div>
        ) : (
          <div className="grid min-h-[70vh] place-items-center p-8 text-center">
            <div>
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#fff4d8] text-[#9b6819]">
                <ShoppingCart className="h-8 w-8" />
              </span>
              <h3 className="mt-4 font-serif text-2xl font-bold text-[#351b12]">Your cart is empty</h3>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-[#715240]">
                Add books to your cart, or message the shop for help with editions,
                languages, and bulk temple orders.
              </p>
              <button type="button" onClick={onClose} className="primary-button mx-auto mt-5 w-full sm:w-fit">
                Continue Shopping
              </button>
              <a href={bulkWhatsAppLink} className="secondary-button mx-auto mt-3 w-full sm:w-fit">
                <MessageCircle className="h-5 w-5" />
                Ask on WhatsApp
              </a>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function CheckoutModal({ cartItems, onClose, onPlaceOrder, checkoutStatus = 'idle', orderError = '', savedCustomerProfile = emptyCustomerProfile }) {
  const { subtotal, shipping, total } = getOrderTotals(cartItems);
  const isSubmitting = checkoutStatus === 'loading';
  const isRetryable = checkoutStatus === 'retryable_error';
  const normalizedSavedProfile = normalizeCustomerProfile(savedCustomerProfile);
  const [form, setForm] = useState({
    fullName: normalizedSavedProfile.fullName,
    phone: normalizedSavedProfile.phone,
    email: normalizedSavedProfile.email,
    address: '',
    city: normalizedSavedProfile.city,
    state: '',
    pincode: normalizedSavedProfile.pincode,
    notes: '',
    paymentMethod: '',
    couponCode: '',
  });
  const [idempotencyKey, setIdempotencyKey] = useState(() => globalThis.crypto.randomUUID());
  const [errors, setErrors] = useState({});
  const checkoutWhatsAppLink = makeWhatsAppLink(makeCartWhatsAppMessage(cartItems, form, '', form.paymentMethod));

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setIdempotencyKey(globalThis.crypto.randomUUID());
    setErrors((current) => {
      if (!current[field]) return current;
      const { [field]: removed, ...rest } = current;
      return rest;
    });
  };

  const validate = () => {
    const nextErrors = {};

    if (!form.fullName.trim()) nextErrors.fullName = 'Full name is required.';
    if (!form.phone.trim()) nextErrors.phone = 'Phone / WhatsApp is required.';
    if (!form.address.trim()) nextErrors.address = 'Delivery address is required.';
    if (!form.city.trim()) nextErrors.city = 'City is required.';
    if (!form.pincode.trim()) nextErrors.pincode = 'Pincode is required.';
    if (!form.paymentMethod) nextErrors.paymentMethod = 'Select a payment method.';

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const submitCheckout = (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (!validate()) return;

    onPlaceOrder({
      customer: {
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        pincode: form.pincode.trim(),
        notes: form.notes.trim(),
      },
      paymentMethod: form.paymentMethod,
      couponCode: form.couponCode.trim(),
      idempotencyKey,
      items: cartItems,
    });
  };

  const paymentMethods = [
    {
      id: 'upi',
      title: 'UPI',
      text: 'Pay by UPI after order confirmation.',
      icon: PhoneCall,
    },
    {
      id: 'online',
      title: 'Cards / Online Payment',
      text: 'Our team will share a secure payment link.',
      icon: CreditCard,
    },
    {
      id: 'cod',
      title: 'Cash on Delivery',
      text: 'Available after serviceability confirmation.',
      icon: PackageCheck,
    },
    {
      id: 'whatsapp',
      title: 'WhatsApp Confirmation',
      text: 'Confirm availability and payment on WhatsApp.',
      icon: MessageCircle,
    },
  ];

  return (
    <Modal onClose={onClose}>
      <div className="pb-20 lg:pb-0">
        <div className="border-b border-[#eadfca] pb-4 pr-12">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#9b6819]">Secure order request</p>
          <h2 className="mt-2 font-serif text-3xl font-bold text-[#351b12]">Checkout</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#715240] sm:text-base">
            Enter your delivery details and preferred payment method. We will
            confirm your order before dispatch.
          </p>
        </div>

        <div className="mt-5 grid min-w-0 gap-6 lg:grid-cols-[1fr_360px]">
          <form id="checkout-form" onSubmit={submitCheckout} className="order-2 min-w-0 lg:order-1">
            <div className="border border-[#eadfca] bg-[#fffdf8] p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-extrabold text-[#351b12]">Payment Method</p>
                  <p className="text-sm text-[#715240]">Choose how you prefer to complete payment after confirmation.</p>
                </div>
                {errors.paymentMethod && (
                  <p className="text-sm font-bold text-[#9b1c2c]">{errors.paymentMethod}</p>
                )}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {paymentMethods.map((method) => {
                  const Icon = method.icon;
                  const selected = form.paymentMethod === method.id;

                  return (
                    <label
                      key={method.id}
                      className={`grid cursor-pointer gap-2 border p-4 transition ${
                        selected
                          ? 'border-[#64131d] bg-[#fff4d8] shadow-sm shadow-[#64131d]/10'
                          : 'border-[#d9c396] bg-white hover:border-[#b68b3a]'
                      }`}
                    >
                      <span className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={method.id}
                          checked={selected}
                          onChange={(event) => updateField('paymentMethod', event.target.value)}
                          className="mt-1 accent-[#64131d]"
                        />
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[#fffaf0] text-[#64131d]">
                          <Icon className="h-5 w-5" />
                        </span>
                        <span>
                          <span className="block text-sm font-black text-[#351b12]">{method.title}</span>
                          <span className="mt-1 block text-xs font-semibold leading-5 text-[#715240]">{method.text}</span>
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
              <CheckoutField
                label="Full Name"
                name="fullName"
                value={form.fullName}
                onChange={updateField}
                error={errors.fullName}
                placeholder="Customer name"
                autoComplete="name"
                required
              />
              <CheckoutField
                label="Phone / WhatsApp"
                name="phone"
                value={form.phone}
                onChange={updateField}
                error={errors.phone}
                placeholder="+91"
                autoComplete="tel"
                required
              />
              <CheckoutField
                label="Email (optional)"
                name="email"
                type="email"
                value={form.email}
                onChange={updateField}
                placeholder="name@example.com"
                autoComplete="email"
              />
              <CheckoutField
                label="City"
                name="city"
                value={form.city}
                onChange={updateField}
                error={errors.city}
                placeholder="Bengaluru"
                autoComplete="address-level2"
                required
              />
              <CheckoutField
                label="State"
                name="state"
                value={form.state}
                onChange={updateField}
                placeholder="Karnataka"
                autoComplete="address-level1"
              />
              <CheckoutField
                label="Pincode"
                name="pincode"
                value={form.pincode}
                onChange={updateField}
                error={errors.pincode}
                placeholder="560053"
                autoComplete="postal-code"
                required
              />
              <CheckoutField
                label="Delivery Address"
                name="address"
                value={form.address}
                onChange={updateField}
                error={errors.address}
                placeholder="House number, street, area"
                autoComplete="street-address"
                textarea
                required
                className="sm:col-span-2"
              />
              <CheckoutField
                label="Notes (optional)"
                name="notes"
                value={form.notes}
                onChange={updateField}
                placeholder="Preferred delivery timing, gifting note, or availability request"
                textarea
                className="sm:col-span-2"
              />
              <CheckoutField
                label="Coupon code (optional)"
                name="couponCode"
                value={form.couponCode}
                onChange={updateField}
                placeholder="Enter coupon code"
                autoComplete="off"
                className="sm:col-span-2"
              />
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <a href={checkoutWhatsAppLink} className="secondary-button w-full border-[#1f7a3b] text-[#1f7a3b] hover:border-[#1f7a3b] hover:bg-[#eefaf1]">
                <MessageCircle className="h-5 w-5" />
                Confirm on WhatsApp
              </a>
              <button type="submit" className="primary-button w-full sm:min-w-48" disabled={isSubmitting}>
                <PackageCheck className="h-5 w-5" />
                {isSubmitting ? 'Submitting securely...' : isRetryable ? 'Retry secure checkout' : 'Place Order'}
              </button>
            </div>
            {orderError && (
              <div className="mt-4 border border-[#e8b8b8] bg-[#fff1f1] px-4 py-3 text-sm font-semibold text-[#9b1c2c]" role="alert">
                {orderError}
              </div>
            )}
          </form>

          <OrderSummaryPanel
            cartItems={cartItems}
            subtotal={subtotal}
            shipping={shipping}
            total={total}
            className="order-1 lg:order-2"
            isSubmitting={isSubmitting}
            isRetryable={isRetryable}
          />
        </div>

        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#eadfca] bg-[#fffaf0]/96 p-3 shadow-[0_-12px_30px_rgba(53,27,18,0.16)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#8a705c]">Total</p>
              <p className="text-lg font-black text-[#64131d]">{formatPrice(total)}</p>
            </div>
            <button type="submit" form="checkout-form" className="primary-button min-h-12 flex-1 px-3" disabled={isSubmitting}>
              <PackageCheck className="h-5 w-5" />
              {isSubmitting ? 'Submitting...' : isRetryable ? 'Retry checkout' : 'Place Order'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function OrderSummaryPanel({ cartItems, subtotal, shipping, total, className = '', isSubmitting = false, isRetryable = false }) {
  return (
    <details open className={`border border-[#eadfca] bg-[#fffaf0] p-4 sm:p-5 ${className}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span>
          <span className="block font-serif text-2xl font-bold text-[#351b12]">Order Summary</span>
          <span className="mt-1 block text-sm text-[#715240]">{cartItems.length} item{cartItems.length === 1 ? '' : 's'} in cart</span>
        </span>
        <ChevronDown className="h-5 w-5 text-[#8c5f17]" />
      </summary>
      <div className="mt-4 grid gap-3">
        {cartItems.map((item) => (
          <div key={item.id} className="grid grid-cols-[1fr_auto] gap-3 text-sm">
            <span className="min-w-0 text-[#604638]">{item.title} x {item.quantity}</span>
            <strong>{formatPrice(item.price * item.quantity)}</strong>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs font-semibold leading-5 text-[#8c4b0b]">
        This is an estimate. Current prices, stock, coupon eligibility, shipping, and the final total are verified securely when you submit.
      </p>
      <div className="mt-5 border-t border-[#eadfca] pt-4">
        <SummaryRow label="Subtotal" value={formatPrice(subtotal)} />
        <SummaryRow label="Shipping" value={shipping ? formatPrice(shipping) : 'Free'} />
        <SummaryRow label="Total" value={formatPrice(total)} strong />
      </div>
      <button type="submit" form="checkout-form" className="primary-button mt-4 w-full" disabled={isSubmitting}>
        <PackageCheck className="h-5 w-5" />
        {isSubmitting ? 'Submitting securely...' : isRetryable ? 'Retry secure checkout' : 'Place Order'}
      </button>
    </details>
  );
}

function CheckoutField({
  label,
  name,
  value,
  onChange,
  error = '',
  type = 'text',
  placeholder = '',
  autoComplete,
  textarea = false,
  required = false,
  className = '',
}) {
  const fieldId = `checkout-${name}`;
  const fieldClasses = `form-field ${error ? 'border-[#9b1c2c] bg-[#fff8f8]' : ''}`;

  return (
    <label className={`grid min-w-0 gap-2 text-sm font-bold text-[#351b12] ${className}`} htmlFor={fieldId}>
      <span>{label}{required && <span className="text-[#9b1c2c]"> *</span>}</span>
      {textarea ? (
        <textarea
          id={fieldId}
          value={value}
          onChange={(event) => onChange(name, event.target.value)}
          rows="3"
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          className={`${fieldClasses} resize-none`}
        />
      ) : (
        <input
          id={fieldId}
          type={type}
          value={value}
          onChange={(event) => onChange(name, event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          className={fieldClasses}
        />
      )}
      {error && <span className="text-xs font-bold text-[#9b1c2c]">{error}</span>}
    </label>
  );
}

function SummaryRow({ label, value, strong = false }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? 'border-t border-[#eadfca] pt-3 text-lg font-extrabold text-[#64131d]' : 'text-[#604638]'}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function TrackOrderModal({ onClose }) {
  return (
    <Modal onClose={onClose} compact>
      <span className="grid h-14 w-14 place-items-center rounded-full bg-[#fff4d8] text-[#9b6819]">
        <PackageSearch className="h-7 w-7" />
      </span>
      <h2 className="mt-5 font-serif text-3xl font-bold text-[#351b12]">Online tracking is temporarily unavailable</h2>
      <p className="mt-3 leading-7 text-[#715240]">
        We cannot securely look up live order status while the order system is being upgraded. No status shown here is generated or estimated.
      </p>
      <a href={generalWhatsAppLink} className="primary-button mt-6 w-full border-[#1f7a3b] bg-[#1f7a3b] hover:bg-[#195f30]">
        <MessageCircle className="h-5 w-5" />
        Ask about an existing order on WhatsApp
      </a>
    </Modal>
  );
}

function AccountModal({
  onClose,
  customerProfile,
  bulkOrderProfile,
  wishlistProducts,
  customerOrders,
  onSaveCustomerProfile,
  onSaveBulkOrderProfile,
  onRemoveWishlist,
  onAddToCart,
  onRepeatOrder,
}) {
  const [activeSection, setActiveSection] = useState('profile');
  const [profileForm, setProfileForm] = useState(customerProfile);
  const [bulkForm, setBulkForm] = useState(bulkOrderProfile);
  const [profileNotice, setProfileNotice] = useState('');
  const [bulkNotice, setBulkNotice] = useState('');
  const [profileError, setProfileError] = useState('');
  const [bulkError, setBulkError] = useState('');
  const savedProfile = normalizeCustomerProfile(customerProfile);
  const savedBulkProfile = normalizeBulkOrderProfile(bulkOrderProfile);
  const profileComplete = Boolean(savedProfile.fullName && savedProfile.phone);
  const bulkProfileComplete = Boolean(savedBulkProfile.contactName && savedBulkProfile.phone);
  const bulkWhatsAppLink = makeWhatsAppLink(makeBulkProfileWhatsAppMessage(savedBulkProfile));

  const sections = [
    { id: 'profile', label: profileComplete ? 'Details Added' : 'Contact Details' },
    { id: 'wishlist', label: `Saved Wishlist (${wishlistProducts.length})` },
    { id: 'orders', label: 'Order History Unavailable' },
    { id: 'bulk', label: bulkProfileComplete ? 'Bulk Details Added' : 'Bulk Order Details' },
  ];

  const updateProfileField = (field, value) => {
    setProfileForm((current) => ({ ...current, [field]: value }));
    setProfileNotice('');
    setProfileError('');
  };

  const updateBulkField = (field, value) => {
    setBulkForm((current) => ({ ...current, [field]: value }));
    setBulkNotice('');
    setBulkError('');
  };

  const saveProfile = (event) => {
    event.preventDefault();
    const normalized = normalizeCustomerProfile(profileForm);

    if (!normalized.fullName || !normalized.phone) {
      setProfileError('Please enter the customer name and WhatsApp phone number.');
      return;
    }

    onSaveCustomerProfile(normalized);
    setProfileNotice('Details are available only for this open browser session and are not stored on this device.');
  };

  const saveBulkProfile = (event) => {
    event.preventDefault();
    const normalized = normalizeBulkOrderProfile(bulkForm);

    if (!normalized.contactName || !normalized.phone) {
      setBulkError('Please enter the contact person and WhatsApp phone number.');
      return;
    }

    onSaveBulkOrderProfile(normalized);
    setBulkNotice('Details are kept only for this open browser session. You can now send the enquiry on WhatsApp.');
  };

  return (
    <Modal onClose={onClose}>
      <div className="border-b border-[#eadfca] pb-5 pr-12">
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#9b6819]">Customer tools</p>
        <h2 className="mt-2 font-serif text-3xl font-bold text-[#351b12]">Customer Tools</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#715240] sm:text-base">
          Manage wishlisted books and prepare WhatsApp enquiries. Contact and bulk-order details stay in memory only for this open browser session.
        </p>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[260px_1fr]">
        <nav className="grid gap-3 self-start" aria-label="Customer account sections">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={`flex min-h-14 items-center justify-between border px-4 py-3 text-left text-sm font-black transition ${
                activeSection === section.id
                  ? 'border-[#64131d] bg-[#fff4d8] text-[#64131d]'
                  : 'border-[#eadfca] bg-[#fffdf8] text-[#351b12] hover:border-[#b68b3a]'
              }`}
            >
              <span>{section.label}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#8c5f17]" />
            </button>
          ))}
        </nav>

        <div className="min-w-0">
          {activeSection === 'profile' && (
            <section className="border border-[#eadfca] bg-[#fffdf8] p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-[#fff4d8] text-[#64131d]">
                  <User className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-serif text-2xl font-bold text-[#351b12]">Contact Details</h3>
                  <p className="mt-1 text-sm leading-6 text-[#715240]">
                    These details are not an account and are not saved to localStorage. They remain available only until this page is closed or refreshed.
                  </p>
                </div>
              </div>

              <form onSubmit={saveProfile} className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-bold text-[#351b12]">
                  Full Name
                  <input
                    className="form-field"
                    value={profileForm.fullName}
                    onChange={(event) => updateProfileField('fullName', event.target.value)}
                    placeholder="Customer name"
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold text-[#351b12]">
                  Phone / WhatsApp
                  <input
                    className="form-field"
                    value={profileForm.phone}
                    onChange={(event) => updateProfileField('phone', event.target.value)}
                    placeholder="+91"
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold text-[#351b12]">
                  Email optional
                  <input
                    className="form-field"
                    type="email"
                    value={profileForm.email}
                    onChange={(event) => updateProfileField('email', event.target.value)}
                    placeholder="name@example.com"
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold text-[#351b12]">
                  City
                  <input
                    className="form-field"
                    value={profileForm.city}
                    onChange={(event) => updateProfileField('city', event.target.value)}
                    placeholder="Bengaluru"
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold text-[#351b12]">
                  Pincode
                  <input
                    className="form-field"
                    value={profileForm.pincode}
                    onChange={(event) => updateProfileField('pincode', event.target.value)}
                    placeholder="560053"
                  />
                </label>
                <div className="grid gap-2 sm:items-end">
                  <button type="submit" className="primary-button min-h-12 w-full">
                    <Save className="h-5 w-5" />
                    Use for This Visit
                  </button>
                </div>
              </form>
              {(profileError || profileNotice) && (
                <p className={`mt-4 border px-4 py-3 text-sm font-semibold ${
                  profileError
                    ? 'border-[#e8b8b8] bg-[#fff1f1] text-[#9b1c2c]'
                    : 'border-[#9fd7a8] bg-[#eefaf1] text-[#1f7a3b]'
                }`}>
                  {profileError || profileNotice}
                </p>
              )}
            </section>
          )}

          {activeSection === 'wishlist' && (
            <section className="border border-[#eadfca] bg-[#fffdf8] p-5">
              <h3 className="font-serif text-2xl font-bold text-[#351b12]">Saved Wishlist</h3>
              <p className="mt-1 text-sm leading-6 text-[#715240]">
                Books saved with the heart button are shown here for quick review.
              </p>

              {wishlistProducts.length ? (
                <div className="mt-5 grid gap-4">
                  {wishlistProducts.map((product) => (
                    <article key={product.id} className="grid gap-4 border border-[#eadfca] bg-white p-4 sm:grid-cols-[72px_1fr]">
                      <ProductImage product={product} variant="mini" />
                      <div className="min-w-0">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <h4 className="font-serif text-xl font-bold text-[#351b12]">{product.title}</h4>
                            <p className="mt-1 text-sm text-[#715240]">{product.category} / {product.language}</p>
                            <p className="mt-2 font-black text-[#64131d]">{formatPrice(product.price)}</p>
                          </div>
                          <div className="grid gap-2 sm:min-w-36">
                            <a href={`#product/${product.id}`} onClick={onClose} className="secondary-button w-full">
                              View Book
                            </a>
                            <button
                              type="button"
                              onClick={() => {
                                onAddToCart(product);
                                onClose();
                              }}
                              className="primary-button w-full"
                            >
                              <ShoppingCart className="h-4 w-4" />
                              Add to Cart
                            </button>
                            <button type="button" onClick={() => onRemoveWishlist(product.id)} className="admin-small-button w-full">
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-5 border border-dashed border-[#d9c396] bg-white p-6 text-center">
                  <Heart className="mx-auto h-10 w-10 text-[#9b6819]" />
                  <h4 className="mt-3 font-serif text-xl font-bold text-[#351b12]">No saved books yet</h4>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#715240]">
                    Tap the heart icon on any book to save it here.
                  </p>
                  <a href="#catalog" onClick={onClose} className="primary-button mx-auto mt-4 w-full sm:w-fit">
                    Browse Books
                  </a>
                </div>
              )}
            </section>
          )}

          {activeSection === 'orders' && (
            <section className="border border-[#eadfca] bg-[#fffdf8] p-5">
              <h3 className="font-serif text-2xl font-bold text-[#351b12]">Order History</h3>
              <p className="mt-1 text-sm leading-6 text-[#715240]">
                Order records are not stored in this browser. Contact the bookstore on WhatsApp with your existing order reference for help.
              </p>

              {customerOrders.length ? (
                <div className="mt-5 grid gap-4">
                  {customerOrders.map((order) => (
                    <article key={order.orderNumber || order.id} className="border border-[#eadfca] bg-white p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-serif text-xl font-bold text-[#64131d]">{order.orderNumber}</p>
                          <p className="mt-1 text-sm font-semibold text-[#715240]">{formatDateTime(order.createdAt)}</p>
                        </div>
                        <strong className="text-xl text-[#64131d]">{formatPrice(order.total)}</strong>
                      </div>
                      <div className="mt-4 grid gap-2 text-sm text-[#604638]">
                        {(order.items || []).map((item) => (
                          <div key={`${order.orderNumber}-${item.id || item.title}`} className="flex justify-between gap-3">
                            <span>{item.title} x {item.quantity}</span>
                            <strong>{formatPrice(Number(item.price || 0) * Number(item.quantity || 1))}</strong>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <a
                          href={makeWhatsAppLink(makeCartWhatsAppMessage(order.items || [], order.customer, order.orderNumber, order.paymentMethod))}
                          className="secondary-button w-full border-[#1f7a3b] text-[#1f7a3b] hover:border-[#1f7a3b] hover:bg-[#eefaf1]"
                        >
                          <MessageCircle className="h-5 w-5" />
                          WhatsApp Follow-up
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            onRepeatOrder(order);
                            onClose();
                          }}
                          className="primary-button w-full"
                        >
                          <ShoppingCart className="h-5 w-5" />
                          Add Again
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-5 border border-dashed border-[#d9c396] bg-white p-6 text-center">
                  <PackageSearch className="mx-auto h-10 w-10 text-[#9b6819]" />
                  <h4 className="mt-3 font-serif text-xl font-bold text-[#351b12]">Browser order history is disabled</h4>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#715240]">
                    This site does not retain customer contact, address, or order records in localStorage.
                  </p>
                  <a href={generalWhatsAppLink} className="primary-button mx-auto mt-4 w-full sm:w-fit">
                    <MessageCircle className="h-5 w-5" />
                    Ask on WhatsApp
                  </a>
                </div>
              )}
            </section>
          )}

          {activeSection === 'bulk' && (
            <section className="border border-[#eadfca] bg-[#fffdf8] p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-[#fff4d8] text-[#64131d]">
                  <Store className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-serif text-2xl font-bold text-[#351b12]">Bulk Order Profile</h3>
                  <p className="mt-1 text-sm leading-6 text-[#715240]">
                    Prepare details for a temple, school, institution, reseller, or family enquiry. They are not stored after this browser session.
                  </p>
                </div>
              </div>

              <form onSubmit={saveBulkProfile} className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-bold text-[#351b12]">
                  Temple / Institution / Group
                  <input
                    className="form-field"
                    value={bulkForm.organizationName}
                    onChange={(event) => updateBulkField('organizationName', event.target.value)}
                    placeholder="Example: Sri Rama Mandira"
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold text-[#351b12]">
                  Contact Person
                  <input
                    className="form-field"
                    value={bulkForm.contactName}
                    onChange={(event) => updateBulkField('contactName', event.target.value)}
                    placeholder="Name"
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold text-[#351b12]">
                  Phone / WhatsApp
                  <input
                    className="form-field"
                    value={bulkForm.phone}
                    onChange={(event) => updateBulkField('phone', event.target.value)}
                    placeholder="+91"
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold text-[#351b12]">
                  City
                  <input
                    className="form-field"
                    value={bulkForm.city}
                    onChange={(event) => updateBulkField('city', event.target.value)}
                    placeholder="Bengaluru"
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold text-[#351b12] sm:col-span-2">
                  Books / Requirement
                  <textarea
                    className="form-field min-h-28 resize-none"
                    value={bulkForm.requirement}
                    onChange={(event) => updateBulkField('requirement', event.target.value)}
                    placeholder="Book names, quantities, language, temple function date, packing needs..."
                  />
                </label>
                <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                  <button type="submit" className="primary-button min-h-12 w-full">
                    <Save className="h-5 w-5" />
                    Use for This Visit
                  </button>
                  <a href={bulkWhatsAppLink} className="secondary-button min-h-12 w-full border-[#1f7a3b] text-[#1f7a3b] hover:border-[#1f7a3b] hover:bg-[#eefaf1]">
                    <MessageCircle className="h-5 w-5" />
                    Send on WhatsApp
                  </a>
                </div>
              </form>
              {(bulkError || bulkNotice) && (
                <p className={`mt-4 border px-4 py-3 text-sm font-semibold ${
                  bulkError
                    ? 'border-[#e8b8b8] bg-[#fff1f1] text-[#9b1c2c]'
                    : 'border-[#9fd7a8] bg-[#eefaf1] text-[#1f7a3b]'
                }`}>
                  {bulkError || bulkNotice}
                </p>
              )}
            </section>
          )}
        </div>
      </div>
    </Modal>
  );
}

function OrderConfirmationModal({ order, onClose }) {
  const whatsappLink = makeWhatsAppLink(
    makeCartWhatsAppMessage(order.items, order.customer, order.orderNumber, order.paymentMethod),
  );

  return (
    <Modal onClose={onClose} compact>
      <div className="text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-[#1f7a3b]" />
        <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.14em] text-[#9b6819]">Order request received</p>
        <h2 className="mt-2 font-serif text-3xl font-bold text-[#351b12]">{order.orderNumber}</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-[#715240] sm:text-base">
          {order.duplicate
            ? 'This request was already received, so we reused the existing order instead of creating a duplicate.'
            : 'Thank you. Your order request has been received. Our team will contact you to confirm payment and dispatch.'}
        </p>
      </div>

      <div className="mt-6 grid gap-3 border border-[#eadfca] bg-[#fffaf0] p-4 text-sm">
        <SummaryRow label="Customer" value={order.customer.fullName} />
        <SummaryRow label="Phone / WhatsApp" value={order.customer.phone} />
        <SummaryRow label="Delivery" value={[order.customer.city, order.customer.pincode].filter(Boolean).join(' / ')} />
        <SummaryRow label="Payment" value={getPaymentMethodLabel(order.paymentMethod)} />
        <SummaryRow label="Total" value={formatPrice(order.total)} strong />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <a href={whatsappLink} className="secondary-button w-full border-[#1f7a3b] text-[#1f7a3b] hover:border-[#1f7a3b] hover:bg-[#eefaf1]">
          <MessageCircle className="h-5 w-5" />
          Send on WhatsApp
        </a>
        <button type="button" onClick={onClose} className="primary-button w-full">
          Continue Shopping
        </button>
      </div>
    </Modal>
  );
}

function Modal({ children, onClose, compact = false }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#20100c]/62 p-4" role="dialog" aria-modal="true">
      <div className={`relative max-h-[92vh] w-full overflow-y-auto bg-white p-5 shadow-2xl sm:p-7 ${compact ? 'max-w-xl' : 'max-w-5xl'}`}>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full border border-[#d9c396] bg-white text-[#351b12]"
          aria-label="Close modal"
        >
          <X className="h-5 w-5" />
        </button>
        {children}
      </div>
    </div>
  );
}

function getCurrentRoute() {
  if (typeof window === 'undefined') return { type: 'store' };
  return getRouteFromLocation(window.location);
}

function replaceRoute(path) {
  window.history.replaceState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

const catalogLoadErrorMessage = 'We could not load the latest catalog right now. Showing the available bookstore catalog.';
const adminProductWriteErrorMessage = 'Could not save this product right now. Please check your admin session and try again.';
const adminProductDeleteErrorMessage = 'Could not delete this product right now. Please check your admin session and try again.';
const adminProductResetErrorMessage = 'Could not reset the catalog right now. Please check your admin session and try again.';
function getAdminProductErrorMessage(error, fallbackMessage = adminProductWriteErrorMessage) {
  const message = String(error?.message || '').trim();

  if (
    message.includes('Permission denied') ||
    message.includes('Session expired') ||
    message.includes('Supabase configuration') ||
    message.includes('Product not found')
  ) {
    return message;
  }

  return fallbackMessage;
}

function getUniqueProductId(title, productsList, currentId = '') {
  const base = slugify(title);
  const existingIds = new Set(productsList.map((product) => product.id).filter((id) => id !== currentId));
  if (!existingIds.has(base)) return base;

  let index = 2;
  while (existingIds.has(`${base}-${index}`)) {
    index += 1;
  }

  return `${base}-${index}`;
}

export default function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeShortcut, setActiveShortcut] = useState('All Books');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [selectedPublisher, setSelectedPublisher] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [sortBy, setSortBy] = useState('popular');
  const [wishlist, setWishlist] = useState(() => {
    const storedWishlist = readLocalPreference(CUSTOMER_WISHLIST_STORAGE_KEY, []);
    return Array.isArray(storedWishlist) ? storedWishlist.filter(Boolean) : [];
  });
  const [cart, setCart] = useState({});
  const [customerProfile, setCustomerProfile] = useState(emptyCustomerProfile);
  const [bulkOrderProfile, setBulkOrderProfile] = useState(emptyBulkOrderProfile);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [productsList, setProductsList] = useState(() => initialProducts.map(normalizeProduct));
  const [isProductLoading, setIsProductLoading] = useState(true);
  const [productError, setProductError] = useState('');
  const [ordersList, setOrdersList] = useState([]);
  const [isOrderLoading, setIsOrderLoading] = useState(false);
  const [orderAdminError, setOrderAdminError] = useState('');
  const [isOrderUpdating, setIsOrderUpdating] = useState('');
  const [isAdminSaving, setIsAdminSaving] = useState(false);
  const [checkoutState, setCheckoutState] = useState({ status: 'idle', message: '' });
  const [route, setRoute] = useState(getCurrentRoute);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [isAdminAuthLoading, setIsAdminAuthLoading] = useState(true);
  const [isAdminAuthenticating, setIsAdminAuthenticating] = useState(false);
  const [adminAuthError, setAdminAuthError] = useState('');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isTrackOpen, setIsTrackOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [orderConfirmation, setOrderConfirmation] = useState(null);

  useEffect(() => {
    writeLocalPreference(CUSTOMER_WISHLIST_STORAGE_KEY, wishlist);
  }, [wishlist]);

  useEffect(() => {
    const handleRouteChange = () => setRoute(getCurrentRoute());
    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);
    return () => {
      window.removeEventListener('hashchange', handleRouteChange);
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe = () => {};

    if (!canAccessAdmin()) {
      setIsAdminAuthenticated(false);
      setIsAdminAuthLoading(false);
      return () => {};
    }

    async function loadAdminSession() {
      setIsAdminAuthLoading(true);
      setAdminAuthError('');

      try {
        const session = await getCurrentAdminSession();

        if (isMounted) {
          setIsAdminAuthenticated(Boolean(session));
        }
      } catch (error) {
        if (isMounted) {
          setIsAdminAuthenticated(false);
          setAdminAuthError(error?.message || 'Session expired. Please sign in again.');
        }
      } finally {
        if (isMounted) {
          setIsAdminAuthLoading(false);
        }
      }
    }

    loadAdminSession();
    unsubscribe = onAdminAuthStateChange((session) => {
      if (!isMounted) return;
      setIsAdminAuthenticated(Boolean(session));
      if (session) setAdminAuthError('');
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadProducts() {
      setIsProductLoading(true);
      setProductError('');

      try {
        const products = await fetchProducts();
        if (isMounted) {
          setProductsList(products.map(normalizeProduct));
        }
      } catch (error) {
        if (isMounted) {
          setProductError(catalogLoadErrorMessage);
        }
      } finally {
        if (isMounted) {
          setIsProductLoading(false);
        }
      }
    }

    loadProducts();

    return () => {
      isMounted = false;
    };
  }, []);

  const loadAdminOrders = async () => {
    setIsOrderLoading(true);
    setOrderAdminError('');

    try {
      const orders = await fetchOrders();
      setOrdersList(orders);
    } catch (error) {
      setOrderAdminError('Could not load orders right now. Please check your admin session and try again.');
    } finally {
      setIsOrderLoading(false);
    }
  };

  useEffect(() => {
    if (!canAccessAdmin() || route.type !== 'adminOrders' || !isAdminAuthenticated) return;
    loadAdminOrders();
  }, [isAdminAuthenticated, route.type]);

  useEffect(() => {
    if (!canAccessAdmin()) return;
    if (isAdminAuthLoading) return;

    if ((route.type === 'adminProducts' || route.type === 'adminOrders') && !isAdminAuthenticated) {
      replaceRoute('/admin/login');
    }

    if (route.type === 'adminLogin' && isAdminAuthenticated) {
      replaceRoute('/admin/products');
    }
  }, [isAdminAuthenticated, isAdminAuthLoading, route.type]);

  const productMap = useMemo(() => new Map(productsList.map((product) => [product.id, product])), [productsList]);
  const wishlistProducts = useMemo(
    () => wishlist.map((id) => productMap.get(id)).filter(Boolean),
    [productMap, wishlist],
  );
  const currentProduct = route.type === 'product' ? productMap.get(route.productId) : null;
  const relatedProducts = useMemo(() => {
    if (!currentProduct) return [];
    return productsList
      .filter(
        (product) =>
          product.id !== currentProduct.id &&
          product.categories.some((category) => currentProduct.categories.includes(category)),
      )
      .slice(0, 4);
  }, [currentProduct, productsList]);

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const cartCount = getCartCount(cart);
  const isAdminRoute = isAdminRouteType(route.type);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const shortcut = activeShortcut;

    const result = productsList.filter((product) => {
      const matchesSearch =
        !normalizedSearch ||
        [product.title, product.subtitle, product.author, product.publisher, product.language, product.category, ...product.categories]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch);

      const matchesShortcut =
        shortcut === 'All Books' ||
        (shortcut === 'Best Sellers' && product.badge === 'Best Seller') ||
        (shortcut === 'New Arrivals' && product.badge === 'New Arrival') ||
        product.categories.includes(shortcut) ||
        product.category === shortcut ||
        (shortcut === 'Bhagavadgita' && product.id.includes('gita')) ||
        (shortcut === 'Astrology' && product.categories.includes('Astrology'));

      const matchesCategory =
        !selectedCategories.length ||
        selectedCategories.some((category) => product.categories.includes(category) || product.category === category);

      const matchesLanguage = !selectedLanguage || product.language.includes(selectedLanguage);
      const matchesPublisher = !selectedPublisher || product.publisher === selectedPublisher;
      const matchesType = !selectedType || product.type === selectedType;

      return matchesSearch && matchesShortcut && matchesCategory && matchesLanguage && matchesPublisher && matchesType;
    });

    return [...result].sort((a, b) => {
      if (sortBy === 'low') return a.price - b.price;
      if (sortBy === 'high') return b.price - a.price;
      if (sortBy === 'new') return (b.badge === 'New Arrival') - (a.badge === 'New Arrival');
      return b.reviews - a.reviews;
    });
  }, [activeShortcut, productsList, searchTerm, selectedCategories, selectedLanguage, selectedPublisher, selectedType, sortBy]);

  const addToCart = (product, quantity = 1) => {
    setCart((current) => ({
      ...current,
      [product.id]: {
        ...product,
        quantity: (current[product.id]?.quantity || 0) + quantity,
      },
    }));
    setIsCartOpen(true);
  };

  const decreaseCart = (id) => {
    setCart((current) => {
      const item = current[id];
      if (!item) return current;
      if (item.quantity <= 1) {
        const { [id]: removed, ...rest } = current;
        return rest;
      }
      return { ...current, [id]: { ...item, quantity: item.quantity - 1 } };
    });
  };

  const deleteCartItem = (id) => {
    setCart((current) => {
      const { [id]: removed, ...rest } = current;
      return rest;
    });
  };

  const toggleWishlist = (id) => {
    setWishlist((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const saveCustomerProfile = (profile) => {
    setCustomerProfile(normalizeCustomerProfile(profile));
  };

  const saveBulkOrderProfile = (profile) => {
    setBulkOrderProfile(normalizeBulkOrderProfile(profile));
  };

  const repeatCustomerOrder = (order) => {
    const orderItems = Array.isArray(order.items) ? order.items : [];

    setCart((current) => {
      const nextCart = { ...current };

      orderItems.forEach((item) => {
        const matchedProduct =
          productMap.get(item.id) ||
          productsList.find(
            (product) =>
              product.title === item.title ||
              product.isbn === item.isbn ||
              product.sku === item.sku,
          );
        const cartProduct = matchedProduct || {
          id: item.id || item.title,
          title: item.title || 'Book',
          subtitle: '',
          category: 'Book',
          language: '',
          publisher: '',
          price: Number(item.price) || 0,
          quantity: 0,
        };
        const quantity = Number(item.quantity) || 1;

        nextCart[cartProduct.id] = {
          ...cartProduct,
          quantity: (nextCart[cartProduct.id]?.quantity || 0) + quantity,
        };
      });

      return nextCart;
    });
    setIsCartOpen(true);
  };

  const syncCartProduct = (updatedProduct) => {
    setCart((current) => {
      if (!current[updatedProduct.id]) return current;
      return {
        ...current,
        [updatedProduct.id]: {
          ...updatedProduct,
          quantity: current[updatedProduct.id].quantity,
        },
      };
    });
  };

  const saveProduct = async (rawProduct) => {
    const currentId = rawProduct.id || '';
    const productId = currentId || getUniqueProductId(rawProduct.title, productsList);
    const normalizedProduct = normalizeProduct({
      ...rawProduct,
      id: productId,
    });

    setIsAdminSaving(true);
    setProductError('');

    try {
      const savedProduct = currentId
        ? await updateProductRecord(productId, normalizedProduct)
        : await createProductRecord(normalizedProduct);
      const normalizedSavedProduct = normalizeProduct(savedProduct);

      setProductsList((current) => {
        const exists = current.some((product) => product.id === normalizedSavedProduct.id);
        return exists
          ? current.map((product) => (product.id === normalizedSavedProduct.id ? normalizedSavedProduct : product))
          : [normalizedSavedProduct, ...current];
      });
      syncCartProduct(normalizedSavedProduct);

      return normalizedSavedProduct;
    } catch (error) {
      const message = getAdminProductErrorMessage(error, adminProductWriteErrorMessage);
      setProductError(message);
      throw new Error(message);
    } finally {
      setIsAdminSaving(false);
    }
  };

  const quickUpdateProduct = async (id, patch) => {
    let updatedProduct = null;
    const previousProduct = productsList.find((product) => product.id === id);

    setProductsList((current) =>
      current.map((product) =>
        product.id === id
          ? (updatedProduct = normalizeProduct({
              ...product,
              ...patch,
            }))
          : product,
      ),
    );

    if (!updatedProduct) return;

    try {
      const savedProduct = normalizeProduct(await updateProductRecord(id, updatedProduct));
      setProductsList((current) => current.map((product) => (product.id === id ? savedProduct : product)));
      syncCartProduct(savedProduct);
    } catch (error) {
      if (previousProduct) {
        setProductsList((current) => current.map((product) => (product.id === id ? previousProduct : product)));
      }
      setProductError(getAdminProductErrorMessage(error, adminProductWriteErrorMessage));
    }
  };

  const deleteProduct = async (id) => {
    try {
      await deleteProductRecord(id);
      setProductsList((current) => current.filter((product) => product.id !== id));
      setWishlist((current) => current.filter((item) => item !== id));
      setCart((current) => {
        const { [id]: removed, ...rest } = current;
        return rest;
      });

      if (route.type === 'product' && route.productId === id) {
        replaceRoute('/admin/products');
      }
    } catch (error) {
      setProductError(getAdminProductErrorMessage(error, adminProductDeleteErrorMessage));
    }
  };

  const resetCatalog = async () => {
    setIsAdminSaving(true);
    setProductError('');

    try {
      const demoProducts = await resetProductsToDemo();
      setProductsList(demoProducts.map(normalizeProduct));
      setWishlist([]);
      setCart({});
    } catch (error) {
      setProductError(getAdminProductErrorMessage(error, adminProductResetErrorMessage));
    } finally {
      setIsAdminSaving(false);
    }
  };

  const toggleCategory = (category) => {
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );
  };

  const clearFilters = () => {
    setSelectedCategories([]);
    setSelectedLanguage('');
    setSelectedPublisher('');
    setSelectedType('');
    setSearchTerm('');
    setActiveShortcut('All Books');
  };

  const startCheckout = () => {
    if (!cartItems.length) {
      setIsCartOpen(true);
      return;
    }

    if (!canSubmitLiveOrder()) {
      setCheckoutState({ status: 'validation_error', message: safeModeMessage });
      setIsCheckoutOpen(false);
      setIsCartOpen(true);
      return;
    }

    setCheckoutState({ status: 'idle', message: '' });
    setIsCartOpen(false);
    setIsCheckoutOpen(true);
  };

  const placeOrder = async (orderRequest) => {
    if (!canSubmitLiveOrder()) {
      setCheckoutState({ status: 'validation_error', message: safeModeMessage });
      return;
    }

    setCheckoutState({ status: 'loading', message: '' });

    try {
      const createdOrder = await createOrderRecord(orderRequest);
      const normalizedCreatedOrder = normalizeCustomerOrder(createdOrder);
      setCheckoutState({ status: createdOrder.duplicate ? 'duplicate' : 'success', message: '' });
      setIsCheckoutOpen(false);
      setCart({});
      setCustomerProfile((current) =>
        normalizeCustomerProfile({
          ...current,
          ...(normalizedCreatedOrder.customer || {}),
        }),
      );
      setCustomerOrders((current) => [
        normalizedCreatedOrder,
        ...current.filter((order) => order.orderNumber !== normalizedCreatedOrder.orderNumber),
      ].slice(0, 20));
      setOrderConfirmation({
        ...normalizedCreatedOrder,
        items: normalizedCreatedOrder.items.map((item) => ({ ...item })),
      });
    } catch (error) {
      setCheckoutState({
        status: error?.retryable ? 'retryable_error' : 'validation_error',
        message: error?.message || 'We could not place your order request. Please retry or contact us on WhatsApp.',
      });
    }
  };

  const updateAdminOrderStatus = async (orderId, status) => {
    const updatingKey = `${orderId}:order`;
    setIsOrderUpdating(updatingKey);
    setOrderAdminError('');

    try {
      const updatedOrder = await updateOrderStatusRecord(orderId, status);
      setOrdersList((current) =>
        current.map((order) =>
          order.id === orderId || order.orderNumber === orderId
            ? {
                ...order,
                orderStatus: updatedOrder?.orderStatus || status,
                updatedAt: updatedOrder?.updatedAt || new Date().toISOString(),
              }
            : order,
        ),
      );
      return updatedOrder;
    } catch (error) {
      const message = 'Could not update order status. Please check your admin session and try again.';
      setOrderAdminError(message);
      throw new Error(message);
    } finally {
      setIsOrderUpdating('');
    }
  };

  const updateAdminPaymentStatus = async (orderId, status) => {
    const updatingKey = `${orderId}:payment`;
    setIsOrderUpdating(updatingKey);
    setOrderAdminError('');

    try {
      const updatedOrder = await updatePaymentStatusRecord(orderId, status);
      setOrdersList((current) =>
        current.map((order) =>
          order.id === orderId || order.orderNumber === orderId
            ? {
                ...order,
                paymentStatus: updatedOrder?.paymentStatus || status,
                updatedAt: updatedOrder?.updatedAt || new Date().toISOString(),
              }
            : order,
        ),
      );
      return updatedOrder;
    } catch (error) {
      const message = 'Could not update payment status. Please check your admin session and try again.';
      setOrderAdminError(message);
      throw new Error(message);
    } finally {
      setIsOrderUpdating('');
    }
  };

  const loginAdmin = async (credentials) => {
    setIsAdminAuthenticating(true);
    setAdminAuthError('');

    try {
      const session = await signInAdmin(credentials);
      setIsAdminAuthenticated(Boolean(session));
      replaceRoute('/admin/products');
      return session;
    } catch (error) {
      const message = error?.message || 'Could not sign in right now. Please try again.';
      setAdminAuthError(message);
      throw new Error(message);
    } finally {
      setIsAdminAuthenticating(false);
    }
  };

  const logoutAdmin = async () => {
    setAdminAuthError('');

    try {
      await signOutAdmin();
    } catch (error) {
      setAdminAuthError(error?.message || 'Could not sign out cleanly. Please try again.');
    } finally {
      setIsAdminAuthenticated(false);
      replaceRoute('/admin/login');
    }
  };

  return (
    <div className="min-h-screen bg-[#fffaf0] text-[#351b12]">
      {!isAdminRoute && (
        <>
          <Header
            cartCount={cartCount}
            wishlistCount={wishlist.length}
            searchTerm={searchTerm}
            onSearch={setSearchTerm}
            onOpenCart={() => setIsCartOpen(true)}
            onOpenTrack={() => setIsTrackOpen(true)}
            onOpenAccount={() => setIsAccountOpen(true)}
          />
          <ReadOnlyBanner />
        </>
      )}
      <main>
        {isAdminRoute && !canAccessAdmin() ? (
          <AdminUnavailable />
        ) : route.type === 'adminLogin' ? (
          isAdminAuthLoading ? (
            <AdminLoadingScreen />
          ) : (
            <AdminLogin
              onLogin={loginAdmin}
              authMode={adminAuthMode}
              authError={adminAuthError}
              isAuthenticating={isAdminAuthenticating}
            />
          )
        ) : route.type === 'adminProducts' ? (
          isAdminAuthLoading ? (
            <AdminLoadingScreen />
          ) : isAdminAuthenticated ? (
            <AdminLayout onLogout={logoutAdmin} currentRoute={route.type}>
              <AdminProducts
                productsList={productsList}
                isLoading={isProductLoading}
                loadError={productError}
                isSaving={isAdminSaving}
                onSaveProduct={saveProduct}
                onQuickUpdate={quickUpdateProduct}
                onDeleteProduct={deleteProduct}
                onResetCatalog={resetCatalog}
              />
            </AdminLayout>
          ) : null
        ) : route.type === 'adminOrders' ? (
          isAdminAuthLoading ? (
            <AdminLoadingScreen />
          ) : isAdminAuthenticated ? (
            <AdminLayout onLogout={logoutAdmin} currentRoute={route.type}>
              <AdminOrders
                ordersList={ordersList}
                isLoading={isOrderLoading}
                loadError={orderAdminError}
                isUpdating={isOrderUpdating}
                onReload={loadAdminOrders}
                onUpdateOrderStatus={updateAdminOrderStatus}
                onUpdatePaymentStatus={updateAdminPaymentStatus}
              />
            </AdminLayout>
          ) : null
        ) : route.type === 'product' ? (
            <ProductPage
              product={currentProduct}
              relatedProducts={relatedProducts}
              isLoading={isProductLoading}
              loadError={productError}
              isWishlisted={currentProduct ? wishlist.includes(currentProduct.id) : false}
            wishlist={wishlist}
            onAddToCart={addToCart}
            onToggleWishlist={toggleWishlist}
          />
        ) : (
          <>
            <Hero onCategorySelect={setActiveShortcut} />
            <Catalog
              productsToShow={filteredProducts}
              activeShortcut={activeShortcut}
              onShortcut={setActiveShortcut}
              selectedCategories={selectedCategories}
              onToggleCategory={toggleCategory}
              selectedLanguage={selectedLanguage}
              onLanguage={setSelectedLanguage}
              selectedPublisher={selectedPublisher}
              onPublisher={setSelectedPublisher}
              selectedType={selectedType}
              onType={setSelectedType}
              sortBy={sortBy}
              onSort={setSortBy}
              onClear={clearFilters}
              wishlist={wishlist}
              onAddToCart={addToCart}
              onToggleWishlist={toggleWishlist}
              totalProducts={productsList.length}
              isLoading={isProductLoading}
              loadError={productError}
            />
            <StoreExperience onOpenTrack={() => setIsTrackOpen(true)} />
            <VisitAndFooter onOpenTrack={() => setIsTrackOpen(true)} />
          </>
        )}
      </main>

      {!isAdminRoute && (
        <CartDrawer
          isOpen={isCartOpen}
          cartItems={cartItems}
          onClose={() => setIsCartOpen(false)}
          onAdd={addToCart}
          onRemove={decreaseCart}
          onDelete={deleteCartItem}
          onCheckout={startCheckout}
          checkoutDisabled={!canSubmitLiveOrder()}
        />
      )}
      {!isAdminRoute && isCheckoutOpen && canSubmitLiveOrder() && (
        <CheckoutModal
          cartItems={cartItems}
          onClose={() => setIsCheckoutOpen(false)}
          onPlaceOrder={placeOrder}
          checkoutStatus={checkoutState.status}
          orderError={checkoutState.message}
          savedCustomerProfile={customerProfile}
        />
      )}
      {!isAdminRoute && isTrackOpen && <TrackOrderModal onClose={() => setIsTrackOpen(false)} />}
      {!isAdminRoute && isAccountOpen && (
        <AccountModal
          onClose={() => setIsAccountOpen(false)}
          customerProfile={customerProfile}
          bulkOrderProfile={bulkOrderProfile}
          wishlistProducts={wishlistProducts}
          customerOrders={customerOrders}
          onSaveCustomerProfile={saveCustomerProfile}
          onSaveBulkOrderProfile={saveBulkOrderProfile}
          onRemoveWishlist={toggleWishlist}
          onAddToCart={addToCart}
          onRepeatOrder={repeatCustomerOrder}
        />
      )}
      {!isAdminRoute && orderConfirmation && (
        <OrderConfirmationModal
          order={orderConfirmation}
          onClose={() => setOrderConfirmation(null)}
        />
      )}
    </div>
  );
}
