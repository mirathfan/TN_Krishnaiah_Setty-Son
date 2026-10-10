import { canAccessAdmin } from '../config/runtimeSafety';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

const adminUnavailableMessage =
  'Admin access is temporarily unavailable while server-side authorization is being secured.';

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
  if (!canAccessAdmin()) return 'blocked';
  return isSupabaseConfigured ? 'supabase' : 'unavailable';
}

export async function getCurrentAdminSession() {
  if (!canAccessAdmin() || !isSupabaseConfigured || !supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error(getSafeAuthErrorMessage(error));
  }

  return data?.session || null;
}

export function onAdminAuthStateChange(callback) {
  if (!canAccessAdmin() || !isSupabaseConfigured || !supabase) return () => {};

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session || null);
  });

  return () => {
    data?.subscription?.unsubscribe();
  };
}

export async function signInAdmin({ email = '', password = '' }) {
  if (!canAccessAdmin()) {
    throw new Error(adminUnavailableMessage);
  }

  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Admin access requires a secured Supabase configuration.');
  }

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

export async function signOutAdmin() {
  if (!canAccessAdmin() || !isSupabaseConfigured || !supabase) {
    return true;
  }

  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(getSafeAuthErrorMessage(error));
  }

  return true;
}
