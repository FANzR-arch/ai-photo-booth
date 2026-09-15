import 'dotenv/config';
import { createApp } from './app.js';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';

const port = Number(process.env.PORT ?? 4377);
const url = `http://localhost:${port}`;
function openBrowser() {
    if (process.env.BOOTH_OPEN_BROWSER !== '1' || process.platform !== 'win32') return;
    const opener = spawn('cmd.exe', ['/d', '/c', 'start', '', url], { windowsHide: true, stdio: 'ignore' });
    opener.on('error', () => console.log(`请手动打开 ${url}`));
    opener.unref();
}
async function existingBooth(): Promise<boolean> {
    try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1200), redirect: 'error' });
        if (!response.ok) return false;
        const h = await response.json();
        if (!['seedream', 'demo'].includes(h.mode) || typeof h.configured !== 'boolean' || ![1, 2].includes(h.imageCount)) return false;
        if (h.service === 'snap-club') return true;
        // Older demo packages predate the service marker; verify their page identity too.
        const page = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1200), redirect: 'error' });
        return page.ok && /<title>[^<]*SNAP CLUB[^<]*<\/title>/i.test(await page.text());
    } catch { return false; }
}
async function probe(host: string) {
    await new Promise<void>((resolve, reject) => {
        const server = createServer();
        server.once('error', reject);
        server.listen({ host, port, exclusive: true }, () => server.close(error => error ? reject(error) : resolve()));
    });
}
async function start() {
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT 必须是 1024–65535 的整数');
    // Check before opening SQLite: a second launch must not alter ongoing generation state.
    if (await existingBooth()) {
        console.log(`拍照亭已经运行，直接打开 ${url}。请保留原来的启动窗口。`);
        openBrowser();
        return;
    }
    // Windows permits overlapping wildcard/loopback binds in some cases; check both.
    await probe('127.0.0.1');
    await probe('0.0.0.0');
    const app = await createApp();
    try { await app.listen({ host: '0.0.0.0', port }); }
    catch (error) { await app.close(); throw error; }
    console.log(`AI 拍照亭已启动：${url} （管理入口 /admin）`);
    openBrowser();
    for (const signal of ['SIGINT', 'SIGTERM'] as const)
        process.on(signal, () => { void app.close().then(() => process.exit(0)); });
}
try { await start(); }
catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        if (await existingBooth()) { console.log(`拍照亭已经运行，直接打开 ${url}。`); openBrowser(); }
        else { console.error(`端口 ${port} 已被占用。请关闭占用程序，或在 .env 中将 PORT 改为 4378 后启动。不会关闭其他程序。`); process.exitCode = 1; }
    } else { console.error(`启动失败：${(error as Error).message}`); process.exitCode = 1; }
}
