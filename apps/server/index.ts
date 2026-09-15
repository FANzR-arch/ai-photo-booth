import 'dotenv/config';
import { createApp } from './app.js';
import { createServer } from 'node:net';
// Windows can bind 0.0.0.0 even when another app owns the same loopback port.
// Probe loopback first so a misleading successful startup cannot hide that conflict.
const port = Number(process.env.PORT ?? 4377);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('PORT 必须是 1024–65535 的整数');
await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error(`端口 ${port} 已被占用，请在 .env 中修改 PORT 并重启。`)));
    probe.listen({ host: '127.0.0.1', port, exclusive: true }, () => probe.close(error => error ? reject(error) : resolve()));
});
const app = await createApp();
await app.listen({ host: '0.0.0.0', port });
console.log(`AI 拍照亭已启动：http://localhost:${process.env.PORT ?? 4377} （管理入口 /admin）`);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => { void app.close().then(() => process.exit(0)); });
