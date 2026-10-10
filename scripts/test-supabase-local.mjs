import { spawnSync } from 'node:child_process';

const cwd = process.cwd();
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const excludedServices = [
  'realtime',
  'imgproxy',
  'mailpit',
  'postgres-meta',
  'studio',
  'edge-runtime',
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
    if (options.capture && result.stderr) process.stderr.write(result.stderr);
    throw new Error(`supabase ${args.join(' ')} failed with exit code ${result.status}`);
  }

  return result;
}

function readStatusValue(status, key) {
  return status[key] || status[key.toLowerCase()] || status[key.toUpperCase()];
}

let started = false;

try {
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
    ['vitest', 'run', 'tests/supabase.integration.test.js'],
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
}
