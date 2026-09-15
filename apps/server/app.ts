/** Single-device server: SQLite owns session/payment state; only token-gated pickup is exposed to LAN clients. */
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import sharp from 'sharp';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { networkInterfaces } from 'node:os';
import type { Session, Order, Style, Mode, Health } from '../../packages/shared/types.js';
export interface GenerateInput {
    photo: Buffer;
    prompt: string;
    size: string;
    count: number;
}
export interface GenerateResult {
    images: Buffer[];
    requestId?: string;
    error?: string;
    unknown?: boolean;
}
export interface AppOptions {
    dataDir?: string;
    rootDir?: string;
    clock?: () => number;
    provider?: (input: GenerateInput) => Promise<GenerateResult>;
    mode?: Mode;
    imageCount?: number;
    ttlMs?: number;
    pickupBaseUrl?: string;
}
type StoredSession = Session & {
    photo?: string;
    files: Record<string, {
        full: string;
        preview: string;
    }>;
    snapshot?: Style;
    token?: string;
};
const local = (s: string) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(s);
const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const object = (v: unknown): Record<string, any> => { if (!v || typeof v !== 'object' || Array.isArray(v))
    throw fail('需要 JSON 对象'); return v as Record<string, any>; };
export async function createApp(options: AppOptions = {}) {
    const root = options.rootDir ?? process.cwd(), data = options.dataDir ?? path.join(root, 'data');
    mkdirSync(data, { recursive: true });
    for (const folder of ['sessions', 'examples'])
        mkdirSync(path.join(data, folder), { recursive: true });
    const db = new DatabaseSync(path.join(data, 'booth.sqlite'));
    db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records(kind TEXT,id TEXT,json TEXT,PRIMARY KEY(kind,id))');
    const get = <T,>(kind: string, id: string): T | undefined => { const r = db.prepare('SELECT json FROM records WHERE kind=? AND id=?').get(kind, id); return r ? JSON.parse(String(r.json)) : undefined; };
    const all = <T,>(kind: string): T[] => db.prepare('SELECT json FROM records WHERE kind=?').all(kind).map(r => JSON.parse(String(r.json)));
    const put = (kind: string, v: {
        id: string;
    }) => db.prepare('INSERT OR REPLACE INTO records VALUES(?,?,?)').run(kind, v.id, JSON.stringify(v));
    const now = options.clock ?? Date.now, ttl = options.ttlMs ?? 86400000;
    const selectedMode = options.mode ?? process.env.GENERATION_MODE ?? 'demo';
    if (!['demo', 'seedream'].includes(selectedMode))
        throw fail('GENERATION_MODE 只能为 demo 或 seedream');
    const mode = selectedMode as Mode;
    const count = options.imageCount ?? (process.env.IMAGE_COUNT === '2' ? 2 : process.env.IMAGE_COUNT === '1' ? 1 : mode === 'demo' ? 2 : 1);
    const port = process.env.PORT ?? '4377';
    const ips = Object.values(networkInterfaces()).flat().filter(x => x?.family === 'IPv4' && !x.internal).map(x => x!.address);
    const base = ((options.pickupBaseUrl ?? process.env.PICKUP_BASE_URL)?.trim() || `http://${ips[0] ?? 'localhost'}:${port}`).replace(/\/$/, '');
    const parsedBase = new URL(base);
    if (!['http:', 'https:'].includes(parsedBase.protocol) || parsedBase.username || parsedBase.password || parsedBase.pathname !== '/')
        throw fail('PICKUP_BASE_URL 必须是完整的网站根地址');
    const health = (): Health => ({ mode, configured: mode === 'demo' || !!options.provider || !!(process.env.SEEDREAM_API_KEY?.trim() && process.env.SEEDREAM_MODEL?.trim()), model: process.env.SEEDREAM_MODEL ?? '', imageCount: count, pickupBaseUrl: base, lanUrls: ips.map(ip => `http://${ip}:${port}`) });
    // Add new bundled styles on upgrade without resetting existing edits, versions or switches.
    {
        const file = path.join(root, 'config/styles/styles.json');
        if (existsSync(file)) {
            const initial = JSON.parse(readFileSync(file, 'utf8'));
            for (const style of Array.isArray(initial) ? initial : initial.styles)
                if (!get<Style>('style', style.id)) put('style', style);
        }
    }
    for (const s of all<StoredSession>('session'))
        if (s.status === 'generating') {
            s.status = 'unknown';
            s.error = '服务曾重启，上游结果未知；为避免重复计费，不自动重试。';
            put('session', s);
        }
    const cleanup = () => { for (const s of all<StoredSession>('session'))
        if (s.expiresAt <= now()) {
            rmSync(path.join(data, 'sessions', s.id), { recursive: true, force: true });
            s.photo = undefined;
            s.files = {};
            put('session', s);
        } };
    cleanup();
    const timer = setInterval(cleanup, 60000);
    timer.unref();
    const app = Fastify({ logger: false, bodyLimit: 17 * 1024 * 1024, trustProxy: false });
    const jobs = new Set<Promise<void>>();
    app.addHook('onClose', async () => { clearInterval(timer); await Promise.allSettled([...jobs]); db.close(); });
    app.setErrorHandler((error, _req, reply) => { reply.code((error as any).statusCode ?? 500).send({ error: (error as any).statusCode ? (error as Error).message : '服务处理失败，请查看服务端记录或重试。' }); });
    app.addHook('onRequest', async (req, reply) => {
        let host: URL;
        try {
            host = new URL(`http://${req.headers.host ?? ''}`);
        }
        catch {
            throw fail('无效 Host', 403);
        }
        const hostname = host.hostname.replace(/^\[|\]$/g, '');
        if (!['localhost', '127.0.0.1', '::1', ...ips, parsedBase.hostname].includes(hostname))
            throw fail('拒绝未知主机', 403);
        if (req.headers.origin) {
            let origin: URL;
            try {
                origin = new URL(req.headers.origin);
            }
            catch {
                throw fail('无效来源', 403);
            }
            const devOrigin = local(req.ip) && ['http://localhost:5173', 'http://127.0.0.1:5173'].includes(origin.origin);
            if ((origin.host !== host.host && !devOrigin) || !['http:', 'https:'].includes(origin.protocol))
                throw fail('拒绝跨站请求', 403);
        }
        if (req.headers['sec-fetch-site'] === 'cross-site')
            throw fail('拒绝跨站请求', 403);
        const url = req.url.split('?')[0];
        const publicRoute = /^\/api\/pickup\/[a-f0-9]{64}(?:\/images\/[a-f0-9-]+)?$/.test(url) || /^\/pickup\/[a-f0-9]{64}$/.test(url) || (/^\/assets\/[\w.-]+$/.test(url) && !url.includes('..')) || url === '/favicon.svg';
        if (!publicRoute && (!local(req.ip) || !['localhost', '127.0.0.1', '::1'].includes(hostname)))
            throw fail('此入口仅允许本机访问', 403);
        if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.headers['content-type']?.toLowerCase().startsWith('application/json'))
            throw fail('请使用 application/json', 415);
        reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer').header('X-Frame-Options', 'DENY').header('Content-Security-Policy', "frame-ancestors 'none'");
    });
    const session = (id: string, allowEnded = false) => { const s = get<StoredSession>('session', id); if (!s)
        throw fail('会话不存在', 404); if (s.expiresAt <= now())
        throw fail('照片已过期', 410); if (s.status === 'ended' && !allowEnded)
        throw fail('本次拍照已结束', 410); return s; };
    // Never return raw paths, original images, prompt snapshots or pickup secrets in ordinary session responses.
    const view = (s: StoredSession): Session => { const { photo, files, snapshot, token, ...v } = s; return v; };
    const validImage = async (v: unknown) => { if (typeof v !== 'string' || !/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=\r\n]+$/.test(v))
        throw fail('只支持 JPEG 或 PNG 照片'); const b = Buffer.from(v.slice(v.indexOf(',') + 1), 'base64'); if (b.length > 12 * 1024 * 1024)
        throw fail('照片不能超过 12MB', 413); try {
        const meta = await sharp(b, { limitInputPixels: 25000000 }).metadata();
        if (!['jpeg', 'png'].includes(meta.format ?? '') || (meta.pages ?? 1) > 1)
            throw Error('format');
        return await sharp(b, { limitInputPixels: 25000000 }).rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
    }
    catch {
        throw fail('无法读取照片，请更换 JPEG 或 PNG 图片');
    } };
    app.get('/api/health', async () => health());
    app.get('/api/styles', async () => all<Style>('style').filter(s => s.enabled).map(({ prompt, ...s }) => s));
    app.post('/api/sessions', async (req) => { const b = object(req.body), style = get<Style>('style', b.styleId); if (!style?.enabled)
        throw fail('风格不可用'); if (/\{\{[^}]*\}\}/.test(style.prompt || '')) throw fail('请先在工作台填写主题提示词中的占位内容'); const s: StoredSession = { id: randomUUID(), styleId: style.id, styleName: style.name, status: 'created', mode, createdAt: now(), expiresAt: now() + ttl, images: [], files: {} }; put('session', s); return view(s); });
    app.get<{
        Params: {
            id: string;
        };
    }>('/api/sessions/:id', async (req) => view(session(req.params.id)));
    app.post<{
        Params: {
            id: string;
        };
    }>('/api/sessions/:id/photo', async (req) => { const s = session(req.params.id); if (!['created', 'photographed'].includes(s.status))
        throw fail('当前状态不能替换照片', 409); const photo = await validImage(object(req.body).dataUrl); const latest = session(s.id); if (!['created', 'photographed'].includes(latest.status))
        throw fail('会话状态已变化', 409); mkdirSync(path.join(data, 'sessions', s.id), { recursive: true }); s.photo = path.join('sessions', s.id, 'photo.jpg'); writeFileSync(path.join(data, s.photo), photo); s.status = 'photographed'; put('session', s); return view(s); });
    const stamp = async (b: Buffer, label: string, preview = false) => { const resized = await sharp(b, { limitInputPixels: 25000000 }).rotate().resize({ width: preview ? 600 : 1600, height: preview ? 800 : 2000, fit: 'inside', withoutEnlargement: true }).jpeg().toBuffer(); const m = await sharp(resized).metadata(); const width = m.width!, height = m.height!; const svg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="${height - 64}" width="${width}" height="64" fill="#121212" fill-opacity=".65"/><text x="24" y="${height - 23}" font-family="sans-serif" font-weight="bold" font-size="${Math.min(28, width / 18)}" fill="white">${label}</text></svg>`); return sharp(resized).composite([{ input: svg }]).jpeg({ quality: preview ? 65 : 92 }).toBuffer(); };
    // Re-read state after every long operation so a completed job cannot revive an abandoned device session.
    async function run(id: string) {
        const start = now();
        let providerCompleted = false;
        try {
            const s = session(id), photo = readFileSync(path.join(data, s.photo!));
            let result: GenerateResult;
            if (mode === 'demo') {
                result = { images: await Promise.all(Array.from({ length: count }, async (_, i) => stamp(await sharp(photo).modulate({ saturation: i ? 0.25 : 1.25, brightness: i ? 1.05 : 1 }).toBuffer(), 'DEMO - NOT AI GENERATED'))) };
            }
            else {
                const provider = options.provider ?? (await import('./providers/seedream.js')).generate;
                result = await provider({ photo, prompt: s.snapshot!.prompt ?? '', size: s.snapshot!.size, count });
                providerCompleted = true;
            }
            const current = get<StoredSession>('session', id);
            if (!current || current.status === 'ended' || current.expiresAt <= now())
                return;
            for (const b of result.images.slice(0, count)) {
                const imageId = randomUUID(), full = path.join('sessions', id, `${imageId}.jpg`), preview = path.join('sessions', id, `${imageId}-preview.jpg`);
                const clean = await sharp(b, { limitInputPixels: 25000000 }).jpeg({ quality: 95 }).toBuffer();
                writeFileSync(path.join(data, full), clean);
                writeFileSync(path.join(data, preview), await stamp(clean, 'PREVIEW / DEMO PAYMENT', true));
                current.files[imageId] = { full, preview };
                current.images.push({ id: imageId, previewUrl: `/api/sessions/${id}/images/${imageId}/preview` });
            }
            if (get<StoredSession>('session', id)?.status === 'ended' || current.expiresAt <= now())
                return;
            current.status = current.images.length >= count ? 'ready' : current.images.length ? 'partial' : result.unknown ? 'unknown' : 'failed';
            current.error = result.error ?? (current.images.length ? undefined : '未返回可用图片');
            current.elapsedMs = now() - start;
            current.requestId = result.requestId;
            put('session', current);
        }
        catch (error) {
            const s = get<StoredSession>('session', id);
            if (s && s.status !== 'ended') {
                s.status = (error as any).unknown || providerCompleted ? 'unknown' : 'failed';
                s.error = providerCompleted ? '上游已返回，但本地保存失败；请检查磁盘，不重复提交以避免重复计费。' : (error as Error).message;
                s.requestId = (error as any).requestId;
                s.elapsedMs = now() - start;
                put('session', s);
            }
        }
    }
    app.post<{
        Params: {
            id: string;
        };
    }>('/api/sessions/:id/generate', async (req) => { const s = session(req.params.id); if (['generating', 'ready', 'partial'].includes(s.status))
        return view(s); if (s.status === 'unknown')
        throw fail('上游结果未知，禁止重复提交以避免重复计费', 409); if (!['photographed', 'failed'].includes(s.status) || !s.photo)
        throw fail('请先拍照', 409); if (!health().configured)
        throw fail('请配置 Seedream API 密钥及模型标识', 503); const style = get<Style>('style', s.styleId); if (!style?.enabled)
        throw fail('风格已关闭'); if (/\{\{[^}]*\}\}/.test(style.prompt || '')) throw fail('请先在工作台填写主题提示词中的占位内容'); s.snapshot = { ...style }; s.promptVersion = style.version; s.status = 'generating'; s.error = undefined; s.images = []; s.files = {}; put('session', s); const job = Promise.resolve().then(() => run(s.id)); jobs.add(job); void job.finally(() => jobs.delete(job)); return view(s); });
    app.post<{
        Params: {
            id: string;
        };
    }>('/api/sessions/:id/end', async (req) => { const s = session(req.params.id, true); s.status = 'ended'; put('session', s); return { ok: true }; });
    app.get<{
        Params: {
            id: string;
            imageId: string;
        };
    }>('/api/sessions/:id/images/:imageId/preview', async (req, reply) => { const files = session(req.params.id).files; const file = Object.hasOwn(files, req.params.imageId) ? files[req.params.imageId] : undefined; if (!file)
        throw fail('图片不存在', 404); return reply.type('image/jpeg').send(readFileSync(path.join(data, file.preview))); });
    app.post<{
        Params: {
            id: string;
        };
    }>('/api/sessions/:id/orders', async (req) => { const s = session(req.params.id); if (!['ready', 'partial'].includes(s.status))
        throw fail('图片尚未准备好', 409); const ids = object(req.body).imageIds; if (!Array.isArray(ids) || !ids.length || ids.length > 2 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !Object.hasOwn(s.files, id)))
        throw fail('选择的图片无效'); const existing = all<Order>('order').find(o => o.sessionId === s.id && ['pending', 'paid'].includes(o.status) && [...o.imageIds].sort().join() === [...ids].sort().join()); if (existing)
        return existing; const o: Order = { id: randomUUID(), sessionId: s.id, imageIds: ids, amount: ids.length === 1 ? 990 : 1990, status: 'pending', createdAt: now() }; put('order', o); return o; });
    app.post<{
        Params: {
            id: string;
        };
    }>('/api/orders/:id/simulate', async (req) => { const o = get<Order>('order', req.params.id); if (!o)
        throw fail('订单不存在', 404); const s = session(o.sessionId, true), outcome = object(req.body).outcome; if (!['paid', 'failed', 'cancelled'].includes(outcome))
        throw fail('支付结果无效'); if (o.status !== 'paid') {
        o.status = outcome;
        if (outcome === 'paid') {
            s.token ??= randomBytes(32).toString('hex');
            s.pickupUrl = `${base}/pickup/${s.token}`;
            put('session', s);
        }
        put('order', o);
    } return { order: o, pickupUrl: o.status === 'paid' ? s.pickupUrl : undefined }; });
    const pickup = (token: string) => { if (!/^[a-f0-9]{64}$/.test(token))
        throw fail('取图链接不存在', 404); const s = all<StoredSession>('session').find(s => s.token === token); if (!s)
        throw fail('取图链接不存在', 404); if (s.expiresAt <= now())
        throw fail('图片已过期', 410); const ids = [...new Set(all<Order>('order').filter(o => o.sessionId === s.id && o.status === 'paid').flatMap(o => o.imageIds))]; return { s, ids }; };
    app.get<{
        Params: {
            token: string;
        };
    }>('/api/pickup/:token', async (req) => { const { s, ids } = pickup(req.params.token); return { status: 'paid', expiresAt: s.expiresAt, mode: s.mode, images: ids.map(id => ({ id, downloadUrl: `/api/pickup/${req.params.token}/images/${id}` })) }; });
    app.get<{
        Params: {
            token: string;
            imageId: string;
        };
    }>('/api/pickup/:token/images/:imageId', async (req, reply) => { const { s, ids } = pickup(req.params.token); if (!ids.includes(req.params.imageId) || !s.files[req.params.imageId])
        throw fail('图片不存在', 404); return reply.type('image/jpeg').header('Content-Disposition', `attachment; filename="photo-${req.params.imageId}.jpg"`).send(readFileSync(path.join(data, s.files[req.params.imageId].full))); });
    app.get('/api/admin', async () => ({ health: health(), styles: all<Style>('style'), sessions: all<StoredSession>('session').sort((a, b) => b.createdAt - a.createdAt).slice(0, 100).map(view), orders: all<Order>('order').sort((a, b) => b.createdAt - a.createdAt).slice(0, 100) }));
    app.put<{
        Params: {
            id: string;
        };
    }>('/api/admin/styles/:id', async (req) => { const s = get<Style>('style', req.params.id); if (!s)
        throw fail('风格不存在', 404); const b = object(req.body); for (const key of ['name', 'prompt', 'description', 'size', 'exampleUrl'])
        if (typeof b[key] !== 'string' || b[key].length > 12000)
            throw fail(`无效字段：${key}`); if (typeof b.enabled !== 'boolean' || !/^\/(examples|admin-examples)\/[\w./-]+$/.test(b.exampleUrl) || b.exampleUrl.includes('..'))
        throw fail('示例图路径或开关无效'); if (!b.name.trim() || !b.prompt.trim() || !b.size.trim())
        throw fail('名称、提示词和尺寸不能为空'); if (b.enabled && /\{\{[^}]*\}\}/.test(b.prompt)) throw fail('请先将提示词中的 {{占位内容}} 替换为实际主题，再开启风格'); if (s.prompt !== b.prompt)
        s.version++; Object.assign(s, ...['name', 'prompt', 'description', 'size', 'exampleUrl', 'enabled'].map(k => ({ [k]: b[k] }))); put('style', s); return s; });
    app.post('/api/admin/examples', async (req) => { const b = await validImage(object(req.body).dataUrl), id = randomUUID() + '.jpg'; writeFileSync(path.join(data, 'examples', id), b); return { url: `/admin-examples/${id}` }; });
    app.get<{
        Params: {
            id: string;
        };
    }>('/admin-examples/:id', async (req, reply) => { if (!/^[\w-]+\.jpg$/.test(req.params.id))
        throw fail('图片不存在', 404); const p = path.join(data, 'examples', req.params.id); if (!existsSync(p))
        throw fail('图片不存在', 404); return reply.type('image/jpeg').send(readFileSync(p)); });
    const examples = path.join(root, 'assets/examples');
    if (existsSync(examples))
        await app.register(fastifyStatic, { root: examples, prefix: '/examples/', decorateReply: false });
    const web = path.join(root, 'dist/web');
    if (existsSync(web)) {
        // Resolve files per request so rebuilding the preview does not strand new hashed assets.
        await app.register(fastifyStatic, { root: web, prefix: '/', decorateReply: false });
        app.get('/stages', async (_req, reply) => reply.type('text/html').send(readFileSync(path.join(web, 'stages.html'))));
        app.setNotFoundHandler(async (req, reply) => { if (req.method === 'GET' && (/^\/pickup\/[a-f0-9]{64}$/.test(req.url) || ['/', '/admin'].includes(req.url)))
            return reply.type('text/html').send(readFileSync(path.join(web, 'index.html'))); return reply.code(404).send({ error: '页面不存在' }); });
    }
    return app;
}
