import { createClient } from '@supabase/supabase-js';
import { runtimeSafety } from '../config/runtimeSafety';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

function hasValidSupabaseUrl(value) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

export const isSupabaseConfigured = Boolean(
  !runtimeSafety.readOnly && hasValidSupabaseUrl(supabaseUrl) && supabaseAnonKey,
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // Admin sessions stay in memory only. A browser refresh requires a new
        // login, and no localStorage value can preserve or grant admin access.
        persistSession: false,
        detectSessionInUrl: false,
      },
    })
  : null;
