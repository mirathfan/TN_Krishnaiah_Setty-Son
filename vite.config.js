import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const originalProductionProjectRef = 'sxdfjtcbfpmwdwtgouea';

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '');
  const vercelEnvironment = process.env.VERCEL_ENV || environment.VERCEL_ENV || '';
  const supabaseUrl = environment.VITE_SUPABASE_URL || '';

  if (vercelEnvironment === 'preview' && supabaseUrl.includes(`${originalProductionProjectRef}.supabase.co`)) {
    throw new Error('Refusing to build a Vercel preview with the original production Supabase project.');
  }

  return {
    plugins: [react(), tailwindcss()],
    // VERCEL_ENV is build metadata and is not normally visible to client code.
    // Embed only this non-secret classification so a Production deployment
    // stays read-only if staging checkout variables are copied accidentally.
    define: {
      'import.meta.env.BUILD_HOST_ENVIRONMENT': JSON.stringify(vercelEnvironment),
    },
  };
});
