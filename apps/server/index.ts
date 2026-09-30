import 'dotenv/config';
import { createApp } from './app.js';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';

let port = Number(process.env.PORT ?? 4377);
let url = `http://localhost:${port}`;
const mode = process.env.GENERATION_MODE?.trim() || 'seedream';
process.env.GENERATION_MODE = mode;
function openBrowser() {
    if (process.env.BOOTH_OPEN_BROWSER !== '1' || !['win32', 'darwin'].includes(process.platform)) return;
    const opener = spawn(process.platform === 'darwin' ? '/usr/bin/open' : 'explorer.exe', [url], { windowsHide: true, stdio: 'ignore' });
    opener.on('error', () => console.log(`请手动打开 ${url}`));
    opener.on('exit', code => { if (code) console.log(`请手动打开 ${url}`); });
    opener.unref();
}
async function existingBooth(): Promise<'same' | 'different' | false> {
    try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1200), redirect: 'error' });
        if (!response.ok) return false;
        const h = await response.json();
        if (!['seedream', 'demo'].includes(h.mode) || typeof h.configured !== 'boolean' || ![1, 2].includes(h.imageCount)) return false;
        if (h.service === 'snap-club') return h.mode === mode ? 'same' : 'different';
        // Older demo packages predate the service marker; verify their page identity too.
        const page = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1200), redirect: 'error' });
        return page.ok && /<title>[^<]*SNAP CLUB[^<]*<\/title>/i.test(await page.text()) ? (h.mode === mode ? 'same' : 'different') : false;
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
    if (!['seedream', 'demo'].includes(mode)) throw new Error('GENERATION_MODE 只能为 seedream 或 demo');
    if (mode === 'seedream') {
        if (!process.env.SEEDREAM_API_KEY?.trim() || !process.env.SEEDREAM_MODEL?.trim())
            throw new Error('请在 .env 配置 SEEDREAM_API_KEY 和 SEEDREAM_MODEL；不会回退到模拟生图。');
        if (!existsSync(path.join(process.cwd(), 'dist/web/index.html')))
            throw new Error('尚未构建正式页面，请先运行 npm run build。');
        if (process.env.BOOTH_FRESH_INSTANCE === '1')
            throw new Error('真实生图使用固定端口和持久数据，请移除 BOOTH_FRESH_INSTANCE=1。');
    }
    if (process.env.BOOTH_FRESH_INSTANCE === '1') {
        const dataDir = path.join(process.cwd(), 'data', 'instances', randomUUID());
        for (let attempt = 0; attempt < 10; attempt++) {
            // Ask Windows for an available port; no dependency on an older booth process.
            port = await new Promise<number>((resolve, reject) => {
                const server = createServer();
                server.once('error', reject);
                server.listen({ host: '0.0.0.0', port: 0, exclusive: true }, () => {
                    const selected = (server.address() as AddressInfo).port;
                    server.close(error => error ? reject(error) : resolve(selected));
                });
            });
            process.env.PORT = String(port);
            url = `http://localhost:${port}`;
            const configuredBase = process.env.PICKUP_BASE_URL?.trim();
            let pickupBaseUrl: string | undefined;
            if (configuredBase) { const base = new URL(configuredBase); base.port = String(port); pickupBaseUrl = base.origin; }
            try { await probe('127.0.0.1'); } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') continue;
                throw error;
            }
            const instance = await createApp({ dataDir, pickupBaseUrl });
            try { await instance.listen({ host: '0.0.0.0', port }); }
            catch (error) {
                await instance.close();
                if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') continue;
                throw error;
            }
            console.log(`拍照亭新窗口已启动：${url} （浏览器未打开时，请复制此地址）`);
            openBrowser();
            for (const signal of ['SIGINT', 'SIGTERM'] as const)
                process.on(signal, () => { void instance.close().then(() => process.exit(0)); });
            return;
        }
        throw new Error('暂时无法分配可用端口，请稍后重试');
    }
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT 必须是 1024–65535 的整数');
    // Check before opening SQLite: a second launch must not alter ongoing generation state.
    const existing = await existingBooth();
    if (existing === 'different') throw new Error('端口上运行的拍照亭模式不同，请先关闭原服务；不会将模拟服务当作真实生图。');
    if (existing === 'same') {
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
    console.log(`生成：${mode === 'seedream' ? 'Seedream 真实生图' : '本地模拟图片'}；支付：模拟支付，不会实际扣款。`);
    console.log(`数据保存在 ${path.join(process.cwd(), 'data')}，重启后继续使用。`);
    openBrowser();
    for (const signal of ['SIGINT', 'SIGTERM'] as const)
        process.on(signal, () => { void app.close().then(() => process.exit(0)); });
}
try { await start(); }
catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        if (await existingBooth() === 'same') { console.log(`拍照亭已经运行，直接打开 ${url}。`); openBrowser(); }
        else { console.error(`端口 ${port} 已被占用。请关闭占用程序，或在 .env 中将 PORT 改为 4378 后启动。不会关闭其他程序。`); process.exitCode = 1; }
    } else { console.error(`启动失败：${(error as Error).message}`); process.exitCode = 1; }
}
