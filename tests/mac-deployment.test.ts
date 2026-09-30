import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'dotenv';

const script = path.resolve('scripts/macos/configure.mjs');
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'snap-mac-config-'));
  return { root, run: (input: string) => spawnSync(process.execPath, [script], { cwd: root, input, encoding: 'utf8' }), close: () => rmSync(root, { recursive: true, force: true }) };
}

test('Mac configuration preserves device settings and customer data without exposing keys', () => {
  const f = fixture();
  try {
    writeFileSync(path.join(f.root, '.env'), '# Device settings\r\nPORT=4455\r\nPICKUP_BASE_URL=http://192.168.1.20:4455\r\nSEEDREAM_API_KEY=old\r\nexport SEEDREAM_MODEL=old-model\r\n');
    writeFileSync(path.join(f.root, 'customer-data-marker'), 'unchanged');
    const secret = 'test-only-$special#key';
    const result = f.run(`${secret}\nnew-model\n`);
    assert.equal(result.status, 0, result.stderr);
    assert.equal((result.stdout + result.stderr).includes(secret), false);
    assert.deepEqual(parse(readFileSync(path.join(f.root, '.env'))), { PORT: '4455', PICKUP_BASE_URL: 'http://192.168.1.20:4455', SEEDREAM_API_KEY: secret, SEEDREAM_MODEL: 'new-model' });
    assert.equal(readFileSync(path.join(f.root, 'customer-data-marker'), 'utf8'), 'unchanged');
    assert.deepEqual(readdirSync(f.root).sort(), ['.env', 'customer-data-marker']);
  } finally { f.close(); }
});

test('invalid Mac credential input never damages an existing configuration', () => {
  const f = fixture();
  try {
    const original = 'PORT=4455\nSEEDREAM_API_KEY=keep-me\nSEEDREAM_MODEL=keep-model\n';
    writeFileSync(path.join(f.root, '.env'), original);
    for (const input of ['\nmodel\n', 'key\n\n', 'key\nmodel\nPORT=9999\n', 'bad"key\nmodel\n', 'bad\\key\nmodel\n']) {
      const result = f.run(input);
      assert.equal(result.status, 1);
      assert.equal(readFileSync(path.join(f.root, '.env'), 'utf8'), original);
      assert.deepEqual(readdirSync(f.root), ['.env']);
    }
  } finally { f.close(); }
});

test('first Mac credential configuration starts from the blank template', () => {
  const f = fixture();
  try {
    writeFileSync(path.join(f.root, '.env.example'), 'GENERATION_MODE=seedream\nPORT=4377\nSEEDREAM_API_KEY=\nSEEDREAM_MODEL=\n');
    assert.equal(f.run('test-only-key\ntest-model\n').status, 0);
    const config = parse(readFileSync(path.join(f.root, '.env')));
    assert.equal(config.PORT, '4377');
    assert.equal(config.SEEDREAM_MODEL, 'test-model');
    assert.equal(parse(readFileSync(path.join(f.root, '.env.example'))).SEEDREAM_API_KEY, '');
  } finally { f.close(); }
});
