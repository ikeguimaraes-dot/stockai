import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const envPath = 'apps/web/.env.local';
if (existsSync(envPath)) {
  const configuredUrl = readFileSync(envPath, 'utf8').match(
    /^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m,
  )?.[1];
  if (
    configuredUrl &&
    !['localhost', '127.0.0.1'].includes(new URL(configuredUrl).hostname) &&
    !process.argv.includes('--switch-to-local')
  ) {
    throw new Error(
      'Remote project configured. Use --switch-to-local explicitly to replace the local environment file. No remote data will be changed.',
    );
  }
}
const status = JSON.parse(
  execFileSync('supabase', ['status', '--output', 'json'], { encoding: 'utf8' }),
);
const url = status.API_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
  throw new Error('This script only works on localhost.');
const key = status.SERVICE_ROLE_KEY ?? status.SECRET_KEY;
const response = await fetch(`${url}/auth/v1/admin/users`, {
  method: 'POST',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'gestor@stockai.local',
    password: 'Stockai.local.2026',
    email_confirm: true,
  }),
});
if (!response.ok) {
  const result = await response.json();
  if (result.code !== 'email_exists' && !String(result.msg).includes('registered'))
    throw new Error(`Local account setup failed: ${response.status}`);
}
writeFileSync(
  'apps/web/.env.local',
  `NEXT_PUBLIC_SUPABASE_URL=${url}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${status.PUBLISHABLE_KEY ?? status.ANON_KEY}\n`,
);
console.log('Local access ready: gestor@stockai.local / Stockai.local.2026');
