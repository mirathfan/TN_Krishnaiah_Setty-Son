import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

const LOCAL_ADMIN_SESSION_KEY = 'tnk-admin-session-v1';
const localAdminUsername = import.meta.env.VITE_ADMIN_USERNAME;
const localAdminPassword = import.meta.env.VITE_ADMIN_PASSWORD;

function canUseLocalStorage() {
  return typeof window !== 'undefined' && window.localStorage;
}

function getLocalAdminSession() {
  if (!canUseLocalStorage()) return null;

  const token = window.localStorage.getItem(LOCAL_ADMIN_SESSION_KEY);
  return token
    ? {
        access_token: token,
        user: { email: 'local-admin@localhost' },
      }
    : null;
}

function setLocalAdminSession() {
  const token = `local-admin-session-${Date.now()}`;

  if (canUseLocalStorage()) {
    window.localStorage.setItem(LOCAL_ADMIN_SESSION_KEY, token);
  }

  return {
    access_token: token,
    user: { email: 'local-admin@localhost' },
  };
}

function clearLocalAdminSession() {
  if (canUseLocalStorage()) {
    window.localStorage.removeItem(LOCAL_ADMIN_SESSION_KEY);
  }
}

function getSafeAuthErrorMessage(error) {
  const message = String(error?.message || '').toLowerCase();
  const status = Number(error?.status || error?.__isAuthError?.status || 0);

  if (message.includes('invalid login') || message.includes('invalid credentials') || status === 400) {
    return 'Wrong email or password.';
  }

  if (message.includes('email not confirmed')) {
    return 'This admin email has not been confirmed yet.';
  }

  if (message.includes('expired') || message.includes('refresh') || status === 401) {
    return 'Session expired. Please sign in again.';
  }

  if (message.includes('permission') || message.includes('not authorized') || status === 403) {
    return 'Permission denied. Please sign in with an authorized admin account.';
  }

  return 'Could not sign in right now. Please try again.';
}

export function getAdminAuthMode() {
  return isSupabaseConfigured ? 'supabase' : 'local';
}

export function isLocalAdminFallbackConfigured() {
  return Boolean(localAdminUsername && localAdminPassword);
}

export async function getCurrentAdminSession() {
  if (!isSupabaseConfigured) {
    return getLocalAdminSession();
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error(getSafeAuthErrorMessage(error));
  }

  return data?.session || null;
}

export function onAdminAuthStateChange(callback) {
  if (!isSupabaseConfigured) return () => {};

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session || null);
  });

  return () => {
    data?.subscription?.unsubscribe();
  };
}

export async function signInAdmin({ email = '', username = '', password = '' }) {
  if (isSupabaseConfigured) {
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      throw new Error('Email and password are required.');
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (error) {
      throw new Error(getSafeAuthErrorMessage(error));
    }

    if (!data?.session) {
      throw new Error('Could not start an admin session. Please try again.');
    }

    return data.session;
  }

  if (!isLocalAdminFallbackConfigured()) {
    throw new Error('Admin database features require Supabase configuration. Local fallback credentials are missing.');
  }

  if (username.trim() === localAdminUsername && password === localAdminPassword) {
    return setLocalAdminSession();
  }

  throw new Error('Wrong username or password.');
}

export async function signOutAdmin() {
  if (!isSupabaseConfigured) {
    clearLocalAdminSession();
    return true;
  }

  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(getSafeAuthErrorMessage(error));
  }

  return true;
}
