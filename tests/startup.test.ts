import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type AddressInfo, type Socket } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer as createHttpServer } from 'node:http';
test('startup rejects occupied loopback port without touching the existing listener', async () => {
    const listener = createServer();
    const sockets = new Set<Socket>();
    listener.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
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
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
    }
});

test('duplicate launch recognizes a running booth and exits successfully without writing to it', async () => {
    const requests: string[] = [];
    const listener = createHttpServer((req, res) => {
        requests.push(`${req.method} ${req.url}`);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ service: 'snap-club', mode: 'seedream', configured: true, imageCount: 1 }));
    });
    await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve));
    try {
        const port = (listener.address() as AddressInfo).port;
        const child = spawn(process.execPath, ['--import', 'tsx', 'apps/server/index.ts'], {
            env: { ...process.env, PORT: String(port), BOOTH_OPEN_BROWSER: '0' }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000,
        });
        let output = ''; child.stdout.on('data', chunk => output += chunk);
        const [code] = await once(child, 'exit');
        assert.equal(code, 0);
        assert.match(output, /已经运行/);
        assert.deepEqual(requests, ['GET /api/health']);
        assert.equal(listener.listening, true);
    } finally { listener.closeAllConnections(); await new Promise<void>(resolve => listener.close(() => resolve())); }
});

test('wildcard port conflict reports a readable message without a Node stack', async () => {
    const listener = createHttpServer((_req, res) => { res.writeHead(404); res.end('other app'); });
    await new Promise<void>(resolve => listener.listen(0, '0.0.0.0', resolve));
    try {
        const port = (listener.address() as AddressInfo).port;
        const child = spawn(process.execPath, ['--import', 'tsx', 'apps/server/index.ts'], {
            env: { ...process.env, PORT: String(port), BOOTH_OPEN_BROWSER: '0' }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000,
        });
        let stderr = ''; child.stderr.on('data', chunk => stderr += chunk);
        const [code] = await once(child, 'exit');
        assert.equal(code, 1);
        assert.match(stderr, /已被占用/);
        assert.doesNotMatch(stderr, /node:net|setupListenHandle/);
    } finally { listener.closeAllConnections(); await new Promise<void>(resolve => listener.close(() => resolve())); }
});
