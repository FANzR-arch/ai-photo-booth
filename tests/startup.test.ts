import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type AddressInfo } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
test('startup rejects occupied loopback port without touching the existing listener', async () => {
    const listener = createServer();
    await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve));
    try {
        const port = (listener.address() as AddressInfo).port;
        const child = spawn(process.execPath, ['--import', 'tsx', 'apps/server/index.ts'], {
            env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000,
        });
        let stderr = '';
        child.stderr.on('data', chunk => stderr += chunk);
        const [code] = await once(child, 'exit');
        assert.equal(code, 1);
        assert.match(stderr, /已被占用/);
        assert.equal(listener.listening, true);
    }
    finally {
        await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
    }
});
