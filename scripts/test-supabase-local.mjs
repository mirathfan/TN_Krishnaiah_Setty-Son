import { spawnSync } from 'node:child_process';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const cwd = process.cwd();
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const excludedServices = [
  'realtime',
  'imgproxy',
  'mailpit',
  'postgres-meta',
  'studio',
  'logflare',
  'vector',
  'supavisor',
].join(',');

function runSupabase(args, options = {}) {
  const result = spawnSync(npxCommand, ['supabase', ...args], {
    cwd,
    encoding: options.capture ? 'utf8' : undefined,
    env: process.env,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });

  if (result.status !== 0 && !options.allowFailure) {
    if (options.capture && result.stdout) process.stderr.write(result.stdout);
    if (options.capture && result.stderr) process.stderr.write(result.stderr);
    throw new Error(`supabase ${args.join(' ')} failed with exit code ${result.status}`);
  }

  return result;
}

function readStatusValue(status, key) {
  return status[key] || status[key.toLowerCase()] || status[key.toUpperCase()];
}

let started = false;
const functionEnvironmentPath = join(cwd, 'supabase', 'functions', '.env');

try {
  writeFileSync(
    functionEnvironmentPath,
    [
      'CHECKOUT_EXECUTION_MODE=local',
      'CHECKOUT_DEPLOYMENT_ENVIRONMENT=local',
      'CHECKOUT_DISPOSABLE_ENV_ACK=I_UNDERSTAND_NO_PRODUCTION_CHECKOUT',
      'CHECKOUT_ALLOWED_ORIGINS=http://127.0.0.1:5173',
      'CHECKOUT_RATE_LIMIT_PEPPER=disposable-local-integration-tests-only',
      'CHECKOUT_RATE_LIMIT_MAX=5',
      'CHECKOUT_RATE_LIMIT_WINDOW_SECONDS=60',
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  console.log('Starting disposable local Supabase stack...');
  runSupabase(['start', '--exclude', excludedServices], { capture: true });
  started = true;

  runSupabase(['db', 'reset', '--local']);
  runSupabase(['test', 'db', '--local', 'supabase/tests/database']);
  runSupabase(['db', 'lint', '--local', '--schema', 'public', '--level', 'warning', '--fail-on', 'error']);

  const statusResult = runSupabase(['status', '-o', 'json'], { capture: true });
  const status = JSON.parse(statusResult.stdout);
  const apiUrl = readStatusValue(status, 'API_URL');
  const anonKey = readStatusValue(status, 'ANON_KEY');
  const serviceRoleKey = readStatusValue(status, 'SERVICE_ROLE_KEY');

  if (!apiUrl || !anonKey || !serviceRoleKey) {
    throw new Error('Local Supabase status did not return API_URL, ANON_KEY, and SERVICE_ROLE_KEY.');
  }

  const integration = spawnSync(
    npxCommand,
    ['vitest', 'run', 'tests/supabase.integration.test.js', 'tests/checkout.integration.test.js'],
    {
      cwd,
      env: {
        ...process.env,
        RUN_SUPABASE_INTEGRATION: '1',
        SUPABASE_URL: apiUrl,
        SUPABASE_ANON_KEY: anonKey,
        SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      },
      stdio: 'inherit',
    },
  );

  if (integration.status !== 0) {
    throw new Error(`Supabase integration tests failed with exit code ${integration.status}`);
  }
} finally {
  if (started) {
    runSupabase(['stop', '--no-backup'], { allowFailure: true, capture: true });
  }
  if (existsSync(functionEnvironmentPath)) unlinkSync(functionEnvironmentPath);
}
