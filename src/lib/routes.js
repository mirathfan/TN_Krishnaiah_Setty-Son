export function getRouteFromLocation(location = {}) {
  const pathname = location.pathname || '/';
  const hash = location.hash || '';

  if (pathname === '/admin/login') {
    return { type: 'adminLogin' };
  }

  if (pathname === '/admin/orders') {
    return { type: 'adminOrders' };
  }

  if (pathname.startsWith('/admin')) {
    return { type: 'adminProducts' };
  }

  if (hash.startsWith('#product/')) {
    return { type: 'product', productId: decodeURIComponent(hash.replace('#product/', '')) };
  }

  return { type: 'store' };
}

export function isAdminRouteType(routeType = '') {
  return routeType === 'adminLogin' || routeType === 'adminProducts' || routeType === 'adminOrders';
}
