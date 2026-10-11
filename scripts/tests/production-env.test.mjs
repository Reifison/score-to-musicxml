import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..');
const baseline = {
  API_DOMAIN: 'api.converter.test', WEB_DOMAIN: 'app.converter.test',
  VITE_API_URL: 'https://api.converter.test', WEB_ORIGIN: 'https://app.converter.test',
  POSTGRES_PASSWORD: 'local-test-only-password', DATABASE_URL: 'postgresql://test:test@postgres/test',
  REDIS_URL: 'redis://redis:6379', SESSION_SECRET: 'local-test-session-secret-with-32-chars',
  ADMIN_EMAIL: 'admin@converter.test', ADMIN_PASSWORD: 'local-test-admin-password'
};

function withEnv(overrides, check) {
  const dir = mkdtempSync(join(tmpdir(), 'score-production-env-'));
  const path = join(dir, 'fixture.env');
  writeFileSync(path, Object.entries({ ...baseline, ...overrides }).map(([key, value]) => `${key}=${value}`).join('\n'), { mode: 0o600 });
  try { check(path, dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
function validate(path) {
  return spawnSync('bash', ['scripts/validate-prod-env.sh', path], { cwd: root, encoding: 'utf8' });
}

test('accepts distinct HTTPS hosts without exposing secrets', () => withEnv({}, path => {
  const result = validate(path);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes(baseline.SESSION_SECRET));
}));
test('accepts one public host and deduplicates Caddy addresses', () => withEnv({ API_DOMAIN: baseline.WEB_DOMAIN, VITE_API_URL: baseline.WEB_ORIGIN }, path => {
  assert.equal(validate(path).status, 0);
  const result = spawnSync('bash', ['-c', 'source scripts/lib/production-env.sh; load_production_env "$1"; resolve_public_domains; printf "%s" "$PUBLIC_DOMAINS"', 'test', path], { cwd: root, encoding: 'utf8' });
  assert.equal(result.stdout, baseline.WEB_DOMAIN);
}));
test('rejects mismatched host, URL path, HTTP and malformed domain', () => {
  for (const change of [
    { VITE_API_URL: 'https://api.other.test' }, { VITE_API_URL: baseline.VITE_API_URL + '/api' },
    { WEB_ORIGIN: 'http://app.converter.test' }, { API_DOMAIN: 'api.converter.test/path' }
  ]) withEnv(change, path => assert.notEqual(validate(path).status, 0));
});
test('does not execute shell command substitutions or additional commands', () => withEnv({}, (path, dir) => {
  const marker = join(dir, 'executed');
  for (const payload of [`bad; touch ${marker}`, `$(touch ${marker})`, '`touch ' + marker + '`']) {
    writeFileSync(path, `API_DOMAIN=${payload}\n`, { mode: 0o600 });
    assert.notEqual(validate(path).status, 0);
    assert.equal(existsSync(marker), false);
  }
}));
test('reads quoted secrets literally and rejects runtime-control overrides', () => {
  withEnv({ SESSION_SECRET: "'local-test-literal-$VALUE-with-32-characters'" }, path => assert.equal(validate(path).status, 0));
  withEnv({ PATH: '/untrusted' }, path => assert.notEqual(validate(path).status, 0));
});
