import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const originalProductionProjectRef = 'sxdfjtcbfpmwdwtgouea';
const forbiddenHostedVariablePattern = /^(?:VITE_ADMIN_|VITE_SUPABASE_|NEXT_PUBLIC_SUPABASE_|VITE_CHECKOUT_|CHECKOUT_|SUPABASE_)/;

export function getForbiddenHostedVariableNames(environment = {}) {
  return Object.keys(environment).filter((name) => forbiddenHostedVariablePattern.test(name)).sort();
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '');
  const vercelEnvironment = process.env.VERCEL_ENV || environment.VERCEL_ENV || '';
  const supabaseUrl = environment.VITE_SUPABASE_URL || '';
  const isHostedReleaseBuild = ['preview', 'production'].includes(vercelEnvironment);
  const forbiddenHostedVariableNames = getForbiddenHostedVariableNames(environment);

  if (vercelEnvironment === 'preview' && supabaseUrl.includes(`${originalProductionProjectRef}.supabase.co`)) {
    throw new Error('Refusing to build a Vercel preview with the original production Supabase project.');
  }

  if (isHostedReleaseBuild && forbiddenHostedVariableNames.length > 0) {
    throw new Error(
      `Refusing read-only Vercel ${vercelEnvironment} build with forbidden backend variables: ${forbiddenHostedVariableNames.join(', ')}`,
    );
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
