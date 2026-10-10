import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const distDirectory = join(process.cwd(), 'dist');
const assetDirectory = join(distDirectory, 'assets');

if (!existsSync(join(distDirectory, 'index.html')) || !existsSync(assetDirectory)) {
  throw new Error('Production bundle is missing. Run npm run build first.');
}

const bundle = [
  readFileSync(join(distDirectory, 'index.html'), 'utf8'),
  ...readdirSync(assetDirectory)
    .filter((name) => /[.](?:js|css)$/.test(name))
    .map((name) => readFileSync(join(assetDirectory, name), 'utf8')),
].join('\n');

const forbiddenPatterns = [
  /VITE_ADMIN_(?:USERNAME|PASSWORD|EMAIL)/,
  /SUPABASE_SERVICE_ROLE_KEY/,
  /local-admin-session/,
];

for (const pattern of forbiddenPatterns) {
  if (pattern.test(bundle)) {
    throw new Error(`Production bundle contains forbidden credential/session marker: ${pattern}`);
  }
}

if (['preview', 'production'].includes(process.env.VERCEL_ENV || '')) {
  const hostedReadOnlyPatterns = [
    /https?:\\?\/\\?\/[^"'\s]+[.]supabase[.]co/i,
    /\/functions\/v1\/checkout/,
    /SupabaseClient|GoTrueClient|PostgrestClient/,
  ];

  for (const pattern of hostedReadOnlyPatterns) {
    if (pattern.test(bundle)) {
      throw new Error(`Hosted read-only bundle contains forbidden backend client material: ${pattern}`);
    }
  }
}

const localEnvironmentPath = join(process.cwd(), '.env.local');
const sensitiveEnvironmentKey = /(?:^|_)(?:ADMIN_(?:USERNAME|PASSWORD|EMAIL)|SERVICE_ROLE_KEY)$/;
const environmentSensitiveValues = Object.entries(process.env)
  .filter(([key]) => sensitiveEnvironmentKey.test(key))
  .map(([, value]) => String(value || ''))
  .filter((value) => value.length >= 6);

const localSensitiveValues = existsSync(localEnvironmentPath)
  ? readFileSync(localEnvironmentPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .filter((match) => sensitiveEnvironmentKey.test(match[1]))
    .map((match) => match[2].replace(/^['"]|['"]$/g, ''))
    .filter((value) => value.length >= 6)
  : [];

if ([...environmentSensitiveValues, ...localSensitiveValues].some((value) => bundle.includes(value))) {
  throw new Error('Production bundle contains a credential value from the build environment.');
}

console.log('Production bundle audit passed: no service-role, obsolete admin, or mock-session material found.');
