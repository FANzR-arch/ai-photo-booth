/** Single-device server: SQLite owns session/payment state; only token-gated pickup is exposed to LAN clients. */
import { recommendedFrame, purposes } from '../../packages/shared/portrait-experience.js';
import Fastify from 'fastify';
import { isFrameId, isCaption, defaultCaption, type Caption, type FrameId } from '../../packages/shared/frames.js';
import { framePhoto } from './photo-frame.js';
import fastifyStatic from '@fastify/static';
import sharp from 'sharp';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { networkInterfaces } from 'node:os';
import type { Session, Order, Style, Mode, Health, PickupData } from '../../packages/shared/types.js';
import { isPhotoOrientation, orientedSize } from '../../packages/shared/photo-orientation.js';
import { isClothingMode } from '../../packages/shared/clothing.js';
import { generationPrompt } from './generation-prompt.js';
import { normalizeSourcePhoto, fullPhoto, previewPhoto } from './photo-quality.js';
import { createAdminAccess } from './admin-auth.js';
import { adminConfiguration } from './admin-config.js';
import { createMacPrinter, type MacPrinter } from './mac-printer.js';
import { registerPrinting } from './printing.js';
import type { PrintJob } from '../../packages/shared/printing.js';
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
    printer?: MacPrinter;
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
    tokenHash?: string;
    retentionMs?: number;
};
const local = (s: string) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(s);
const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const validatePreset = (style: Style | undefined, orientation: Session['orientation'], clothing: Session['clothingMode']) => {
    if (style?.generationPreset === 'coming-of-age') {
        if (orientation !== 'poster' || clothing !== 'theme') throw fail('成人礼海报固定使用 2:3 竖版与深蓝主题换装');
    } else if (style?.generationPreset === 'directed-portrait') {
        if (orientation !== style.sceneOrientation) throw fail('此主题使用固定的场景画幅');
    } else if (orientation !== 'portrait' && orientation !== 'landscape') throw fail('此主题仅支持 3:4 竖版或 4:3 横版');
};
const object = (v: unknown): Record<string, any> => { if (!v || typeof v !== 'object' || Array.isArray(v))
    throw fail('需要 JSON 对象'); return v as Record<string, any>; };
export async function createApp(options: AppOptions = {}) {
    const root = options.rootDir ?? process.cwd(), data = options.dataDir ?? path.join(root, 'data');
    const now = options.clock ?? Date.now, ttl = options.ttlMs ?? 10 * 60 * 1000;
    const selectedMode = options.mode ?? process.env.GENERATION_MODE ?? 'seedream';
    if (!['demo', 'seedream'].includes(selectedMode))
        throw fail('GENERATION_MODE 只能为 demo 或 seedream');
    const mode = selectedMode as Mode;
    // Demo package: one generation plus digital delivery, captured original and manual printing.
    const count = options.imageCount ?? 1;
    const port = process.env.PORT ?? '4377';
    const ips = Object.values(networkInterfaces()).flat().filter(x => x?.family === 'IPv4' && !x.internal).map(x => x!.address);
    const base = ((options.pickupBaseUrl ?? process.env.PICKUP_BASE_URL)?.trim() || `http://${ips[0] ?? 'localhost'}:${port}`).replace(/\/$/, '');
    const parsedBase = new URL(base);
    if (!['http:', 'https:'].includes(parsedBase.protocol) || parsedBase.username || parsedBase.password || parsedBase.pathname !== '/' || parsedBase.search || parsedBase.hash)
        throw fail('PICKUP_BASE_URL 必须是完整的网站根地址');
    const health = (): Health => ({ service: 'snap-club', mode, paymentMode: 'simulate', configured: mode === 'demo' || !!options.provider || config.status().activeConfigured, model: config.credentials().model, imageCount: count, pickupBaseUrl: base, lanUrls: ips.map(ip => `http://${ip}:${port}`) });
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
    const retirementFile = path.join(root, 'config/styles/retired-styles.json');
    const retired: Record<string, string> = existsSync(retirementFile) ? JSON.parse(readFileSync(retirementFile, 'utf8')) : {};
    // Add new bundled styles on upgrade without resetting existing edits, versions or switches.
    {
        const file = path.join(root, 'config/styles/styles.json');
        if (existsSync(file)) {
            const initial = JSON.parse(readFileSync(file, 'utf8'));
            // Upgrade only exact bundled originals; preserve custom prompts and session snapshots.
            const migrationFile = path.join(root, 'config/styles/group-photo-migration.json');
            const previous: Record<string, string> = existsSync(migrationFile)
                ? JSON.parse(readFileSync(migrationFile, 'utf8')) : {};
            const portraitFile = path.join(root, 'config/styles/portrait-migration.json');
            const portraitPrevious: Record<string, string> = existsSync(portraitFile) ? JSON.parse(readFileSync(portraitFile, 'utf8')) : {};
            const wardrobeFile = path.join(root, 'config/styles/wardrobe-migration.json');
            const wardrobePrevious: Record<string, string> = existsSync(wardrobeFile) ? JSON.parse(readFileSync(wardrobeFile, 'utf8')) : {};
            const qualityFile = path.join(root, 'config/styles/quality-migration.json');
            const qualityPrevious: Record<string, string> = existsSync(qualityFile) ? JSON.parse(readFileSync(qualityFile, 'utf8')) : {};
            const poseFile = path.join(root, 'config/styles/pose-migration.json');
            const posePrevious: Record<string, { prompt: string; outfitPrompt?: string }> = existsSync(poseFile) ? JSON.parse(readFileSync(poseFile, 'utf8')) : {};
            const sceneFile = path.join(root, 'config/styles/scene-quality-migration.json');
            const scenePrevious: Record<string, Record<string, string | string[]>> = existsSync(sceneFile) ? JSON.parse(readFileSync(sceneFile, 'utf8')) : {};
            for (const style of Array.isArray(initial) ? initial : initial.styles) {
                if (Object.hasOwn(retired, style.id)) continue;
                const saved = get<Style>('style', style.id);
                if (!saved) put('style', style);
                else {
                    const replacePrompt = typeof saved.prompt === 'string' && saved.prompt !== style.prompt &&
                        [previous[style.id], portraitPrevious[style.id], wardrobePrevious[style.id], qualityPrevious[style.id], posePrevious[style.id]?.prompt].includes(createHash('sha256').update(saved.prompt).digest('hex'));
                    const addOutfit = saved.outfitPrompt === undefined && typeof style.outfitPrompt === 'string';
                    const replaceOutfit = typeof saved.outfitPrompt === 'string' && typeof style.outfitPrompt === 'string' && saved.outfitPrompt !== style.outfitPrompt &&
                        posePrevious[style.id]?.outfitPrompt === createHash('sha256').update(saved.outfitPrompt).digest('hex');
                    const sceneKeys = (['name', 'prompt', 'description', 'exampleUrl', 'size'] as const).filter(key => {
                        if (saved[key] === style[key] || saved[key] === undefined) return false;
                        const hashes = scenePrevious[style.id]?.[key];
                        return (Array.isArray(hashes) ? hashes : [hashes]).includes(createHash('sha256').update(JSON.stringify(saved[key])).digest('hex'));
                    });
                    const addSceneMetadata = style.sourceCode && saved.sourceCode === undefined;
                    if (replacePrompt || addOutfit || replaceOutfit || sceneKeys.length || addSceneMetadata) {
                        const upgraded: Style = { ...saved, version: Math.max(saved.version + 1, style.version) };
                        if (replacePrompt) upgraded.prompt = style.prompt;
                        if (addOutfit || replaceOutfit) upgraded.outfitPrompt = style.outfitPrompt;
                        for (const key of sceneKeys) (upgraded as any)[key] = style[key];
                        if (addSceneMetadata) {
                            upgraded.sourceCode = style.sourceCode;
                            upgraded.sceneOrientation = style.sceneOrientation;
                            upgraded.subjectCount = style.subjectCount;
                        }
                        if (style.id === 'festival' && saved.description === '节日换装 · 暗红衣衫与梅枝，留一张新春纪念。') upgraded.description = style.description;
                        put('style', upgraded);
                    }
                }
            }
        }
    }
    // Remove duplicates from the active catalog, preserving custom prompts for old sessions.
    db.exec('BEGIN IMMEDIATE');
    try {
        for (const id of Object.keys(retired)) {
            const saved = get<Style>('style', id);
            if (saved) {
                put('retired-style', saved);
                db.prepare('DELETE FROM records WHERE kind=? AND id=?').run('style', id);
            }
        }
        db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
    for (const s of all<StoredSession>('session'))
        if (s.status === 'generating') {
            s.status = 'unknown';
            s.error = '服务曾重启，上游结果未知；为避免重复计费，不自动重试。';
            put('session', s);
        }
    const erasePhotos = (s: StoredSession) => {
        if (s.deletedAt !== undefined) return;
        const sessionsDir = path.resolve(data, 'sessions');
        const target = path.resolve(sessionsDir, s.id);
        if (path.dirname(target) !== sessionsDir) throw Error('Invalid session directory');
        rmSync(target, { recursive: true, force: true });
        // Keep only accounting/status records; neither captions nor pickup secrets survive expiry.
        if (s.token) s.tokenHash = createHash('sha256').update(s.token).digest('hex');
        s.token = undefined; s.pickupUrl = undefined; s.photo = undefined; s.snapshot = undefined;
        s.files = {}; s.images = []; s.frame = undefined; s.caption = undefined;
        s.error = undefined; s.deletedAt = now(); s.status = 'ended';
        db.prepare('DELETE FROM records WHERE kind=? AND id=?').run('frame', s.id);
        put('session', s);
    };
    const cleanup = () => { for (const s of all<StoredSession>('session'))
        if (s.expiresAt <= now()) erasePhotos(s); };
    cleanup();
    const timer = setInterval(() => { try { cleanup(); } catch (error) { console.error('Photo cleanup failed', error); } }, 1000);
    timer.unref();
    const app = Fastify({ logger: false, bodyLimit: 17 * 1024 * 1024, trustProxy: false });
    const admin = createAdminAccess(root, now);
    const config = adminConfiguration(root, process.env.SEEDREAM_API_KEY?.trim() || '', process.env.SEEDREAM_MODEL?.trim() || '');
    const cookieName = `snap_admin_${port}`;
    const adminToken = (cookie?: string) => cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    const publicAdminRoutes = new Set(['/api/admin/auth/status', '/api/admin/auth/setup', '/api/admin/auth/login', '/api/admin/auth/logout']);
    const jobs = new Set<Promise<void>>();
    app.addHook('onClose', async () => { clearInterval(timer); await Promise.allSettled([...jobs]); await printing.close(); db.close(); });
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
        if (mode === 'seedream' && ['/stages', '/stages.html'].includes(url)) throw fail('页面不存在', 404);
        const publicRoute = /^\/api\/pickup\/[a-f0-9]{64}(?:\/images\/[a-f0-9-]+|\/original)?$/.test(url) || /^\/pickup\/[a-f0-9]{64}$/.test(url) || (/^\/assets\/[\w.-]+$/.test(url) && !url.includes('..')) || url === '/favicon.svg';
        if (!publicRoute && (!local(req.ip) || !['localhost', '127.0.0.1', '::1'].includes(hostname)))
            throw fail('此入口仅允许本机访问', 403);
        if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.headers['content-type']?.toLowerCase().startsWith('application/json'))
            throw fail('请使用 application/json', 415);
        reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer').header('X-Frame-Options', 'DENY').header('Content-Security-Policy', "frame-ancestors 'none'");
        const route = req.routeOptions.url || url;
        if ((route === '/api/admin' || route.startsWith('/api/admin/')) && !publicAdminRoutes.has(route)) admin.require(adminToken(req.headers.cookie));
    });
    app.get('/api/admin/auth/status', async req => admin.status(adminToken(req.headers.cookie)));
    app.post('/api/admin/auth/setup', { bodyLimit: 2048 }, async (req, reply) => {
        const token = await admin.setup(object(req.body).password);
        reply.header('Set-Cookie', `${cookieName}=${token}; Path=/api/admin; HttpOnly; SameSite=Strict${req.protocol === 'https' ? '; Secure' : ''}`);
        return admin.status(token);
    });
    app.post('/api/admin/auth/login', { bodyLimit: 2048 }, async (req, reply) => {
        const token = await admin.login(object(req.body).password);
        reply.header('Set-Cookie', `${cookieName}=${token}; Path=/api/admin; HttpOnly; SameSite=Strict${req.protocol === 'https' ? '; Secure' : ''}`);
        return admin.status(token);
    });
    app.post('/api/admin/auth/logout', async (req, reply) => {
        admin.logout(adminToken(req.headers.cookie));
        reply.header('Set-Cookie', `${cookieName}=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0`);
        return { authenticated: false };
    });
    app.post('/api/admin/auth/touch', async req => { admin.touch(adminToken(req.headers.cookie)); return { authenticated: true }; });
    const session = (id: string, allowEnded = false) => { const s = get<StoredSession>('session', id); if (!s)
        throw fail('会话不存在', 404); if (s.expiresAt <= now()) {
        erasePhotos(s); throw fail('照片已过期并删除', 410); } if (s.status === 'ended' && !allowEnded)
        throw fail('本次拍照已结束', 410); return s; };
    const packageOrders = (id: string) => all<Order>('order').filter(o => o.sessionId === id && o.product === 'photo-package');
    const currentOrder = (id: string) => {
        const orders = packageOrders(id).reverse();
        return orders.find(o => o.status === 'paid') ?? orders.find(o => o.status === 'pending') ?? orders[0];
    };
    const paidPackage = (id: string) => {
        const order = packageOrders(id).find(o => o.status === 'paid');
        if (!order) throw fail('请先完成套餐付款，再生成或打印照片。', 403);
        return order;
    };
    // Store decoration separately so a slow generation job cannot overwrite a later selection.
    const selectedDecoration = (id: string) => get<{ id: string; frame: FrameId; caption?: Caption }>('frame', id);
    const selectedFrame = (id: string): FrameId => selectedDecoration(id)?.frame ?? 'none';
    const selectedCaption = (id: string): Caption => selectedDecoration(id)?.caption ?? defaultCaption;
    const printing = registerPrinting(app, {
        printer: options.printer ?? createMacPrinter(root), data, now,
        all: () => all<PrintJob>('print'), get: id => get<PrintJob>('print', id), put: job => put('print', job),
        photo: (id, imageId) => {
            const s = session(id);
            const order = paidPackage(id);
            if (!['ready', 'partial'].includes(s.status) || !Object.hasOwn(s.files, imageId)) throw fail('生成照片尚未准备好。', 409);
            if (!order.imageIds.includes(imageId)) throw fail('此照片未包含在已付套餐中。', 403);
            return { photo: readFileSync(path.join(data, s.files[imageId].full)), frame: selectedFrame(id), caption: selectedCaption(id) };
        },
    });
    app.post<{ Params: { id: string } }>('/api/sessions/:id/frame', async req => {
        const s = session(req.params.id);
        const frame = object(req.body).frame;
        if (!isFrameId(frame)) throw fail('边框样式无效');
        const caption = object(req.body).caption ?? selectedCaption(s.id);
        if (!isCaption(caption)) throw fail('文字设置无效，最多输入 80 个字符');
        const choice = { id: s.id, frame, caption };
        put('frame', choice);
        return { frame, caption };
    });
    // Never return raw paths, original images, prompt snapshots or pickup secrets in ordinary session responses.
    const view = (s: StoredSession): Session => { const { photo, files, snapshot, token, tokenHash, retentionMs, order: _staleOrder, ...v } = s; return { ...v, order: currentOrder(s.id), frame: selectedFrame(s.id), caption: selectedCaption(s.id), ...(photo ? { originalUrl: `/api/sessions/${s.id}/original` } : {}) }; };
    const validImage = async (v: unknown) => { if (typeof v !== 'string' || !/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=\r\n]+$/.test(v))
        throw fail('只支持 JPEG 或 PNG 照片'); const b = Buffer.from(v.slice(v.indexOf(',') + 1), 'base64'); if (b.length > 12 * 1024 * 1024)
        throw fail('照片不能超过 12MB', 413); try {
        const meta = await sharp(b, { limitInputPixels: 25000000 }).metadata();
        if (!['jpeg', 'png'].includes(meta.format ?? '') || (meta.pages ?? 1) > 1)
            throw Error('format');
        return await normalizeSourcePhoto(b);
    }
    catch {
        throw fail('无法读取照片，请更换 JPEG 或 PNG 图片');
    } };
    app.get('/api/health', async () => health());
    app.get('/api/styles', async () => all<Style>('style').filter(s => s.enabled).map(({ prompt, outfitPrompt, ...s }) => s));
    app.get<{ Params: { id: string } }>('/api/sessions/:id/original', async (req, reply) => {
        const s = session(req.params.id);
        if (!s.photo) throw fail('原照片不存在', 404);
        return reply.type('image/jpeg').header('Cache-Control', 'no-store')
            .header('Content-Disposition', 'attachment; filename="snap-original.jpg"')
            .send(readFileSync(path.join(data, s.photo)));
    });
    app.post('/api/sessions', async (req) => { const b = object(req.body), style = get<Style>('style', b.styleId); if (b.purpose !== undefined && !purposes.some(p => p.id === b.purpose)) throw fail('照片用途无效'); if (!style?.enabled)
        throw fail('风格不可用'); if (/\{\{[^}]*\}\}/.test(style.prompt || '')) throw fail('请先在工作台填写主题提示词中的占位内容'); const s: StoredSession = { id: randomUUID(), styleId: style.id, styleName: style.name, purpose: b.purpose ?? 'self', orientation: style.sceneOrientation ?? (style.generationPreset === 'coming-of-age' ? 'poster' : 'portrait'), clothingMode: style.generationPreset ? 'theme' : 'keep', status: 'created', mode, createdAt: now(), expiresAt: now() + ttl, retentionMs: ttl, images: [], files: {} }; put('session', s); const decoration = { id: s.id, frame: recommendedFrame(style.id, s.purpose), caption: defaultCaption }; put('frame', decoration); return view(s); });
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
        throw fail('当前状态不能替换照片', 409); const body = object(req.body); if (!isPhotoOrientation(body.orientation)) throw fail('照片比例无效'); const clothing = body.clothingMode === undefined ? s.clothingMode ?? 'keep' : body.clothingMode; if (!isClothingMode(clothing)) throw fail('服装选项无效'); validatePreset(get<Style>('style', s.styleId) ?? get<Style>('retired-style', s.styleId), body.orientation, clothing); const photo = await validImage(body.dataUrl); const latest = session(s.id); if (!['created', 'photographed'].includes(latest.status))
        throw fail('会话状态已变化', 409); if (currentOrder(s.id)?.status === 'paid') throw fail('已付款的原照片不能替换，请开始新体验。', 409); mkdirSync(path.join(data, 'sessions', s.id), { recursive: true }); s.photo = path.join('sessions', s.id, 'photo.jpg'); s.orientation = body.orientation; s.clothingMode = clothing; writeFileSync(path.join(data, s.photo), photo); s.status = 'photographed'; put('session', s); return view(s); });
    // Re-read state after every long operation so a completed job cannot revive an abandoned device session.
    async function run(id: string) {
        const start = now();
        let providerCompleted = false;
        try {
            const s = session(id), photo = readFileSync(path.join(data, s.photo!));
            let result: GenerateResult;
            const orientation = s.orientation ?? 'portrait';
            const outputSize = orientedSize(s.snapshot!.size, orientation);
            const [outputWidth, outputHeight] = /^\d+x\d+$/.test(outputSize) ? outputSize.split('x').map(Number) : orientation === 'poster' ? [1024, 1536] : orientation === 'portrait' ? [1152, 1536] : [1536, 1152];
            if (mode === 'demo') {
                result = { images: await Promise.all(Array.from({ length: count }, async (_, i) => sharp(photo).resize({ width: outputWidth, height: outputHeight, fit: 'cover' }).modulate({ saturation: i ? 0.25 : 1.25, brightness: i ? 1.05 : 1 }).jpeg({ quality: 92 }).toBuffer())) };
            }
            else {
                const provider = options.provider ?? (await import('./providers/seedream.js')).generate;
                result = await provider({ photo, prompt: generationPrompt(s.snapshot!, s.clothingMode ?? 'keep', orientation), size: outputSize, count }, config.credentials());
                providerCompleted = true;
            }
            const active = () => {
                const value = get<StoredSession>('session', id);
                if (!value) return;
                if (value.expiresAt <= now()) { erasePhotos(value); return; }
                if (value.status !== 'generating') return;
                return value;
            };
            if (!active()) return;
            // Prepare in memory, then commit synchronously. Expiry/end during Sharp work cannot recreate files.
            const prepared: { id: string; full: string; preview: string; clean: Buffer; thumbnail: Buffer }[] = [];
            for (const b of result.images.slice(0, count)) {
                const imageId = randomUUID(), full = path.join('sessions', id, `${imageId}.jpg`), preview = path.join('sessions', id, `${imageId}-preview.jpg`);
                const clean = await fullPhoto(b);
                const thumbnail = await previewPhoto(clean);
                if (!active()) return;
                prepared.push({ id: imageId, full, preview, clean, thumbnail });
            }
            const current = active();
            if (!current) return;
            for (const item of prepared) {
                writeFileSync(path.join(data, item.full), item.clean);
                writeFileSync(path.join(data, item.preview), item.thumbnail);
                current.files[item.id] = { full: item.full, preview: item.preview };
                current.images.push({ id: item.id, previewUrl: `/api/sessions/${id}/images/${item.id}/preview` });
            }
            current.status = current.images.length >= count ? 'ready' : current.images.length ? 'partial' : result.unknown ? 'unknown' : 'failed';
            if (current.images.length && !current.completedAt) {
                current.completedAt = now();
                // Existing sessions keep their previously promised expiry during upgrades.
                if (current.retentionMs) current.expiresAt = current.completedAt + current.retentionMs;
            }
            current.error = result.error ?? (current.images.length ? undefined : '未返回可用图片');
            current.elapsedMs = now() - start;
            current.requestId = result.requestId;
            const order = paidPackage(id);
            order.imageIds = current.images.map(image => image.id);
            put('order', order);
            put('session', current);
        }
        catch (error) {
            const s = get<StoredSession>('session', id);
            if (s && s.expiresAt <= now()) erasePhotos(s);
            else if (s && s.status !== 'ended') {
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
    }>('/api/sessions/:id/generate', async (req) => { const s = session(req.params.id); const requestedClothing = object(req.body).clothingMode; const clothing = requestedClothing === undefined ? s.clothingMode ?? 'keep' : requestedClothing; if (!isClothingMode(clothing)) throw fail('服装选项无效'); paidPackage(s.id); if (['generating', 'ready', 'partial'].includes(s.status))
        return view(s); if (s.status === 'unknown')
        throw fail('上游结果未知，禁止重复提交以避免重复计费', 409); if (!['photographed', 'failed'].includes(s.status) || !s.photo)
        throw fail('请先拍照', 409); if (!health().configured)
        throw fail('请配置 Seedream API 密钥及模型标识', 503); if (jobs.size >= 1) throw fail('设备正在处理上一张照片，请稍后再试', 429); const style = get<Style>('style', s.styleId) ?? get<Style>('retired-style', s.styleId); if (!style?.enabled)
        throw fail('风格已关闭'); validatePreset(style, s.orientation ?? 'portrait', clothing); if (/\{\{[^}]*\}\}/.test(style.prompt || '')) throw fail('请先在工作台填写主题提示词中的占位内容'); s.clothingMode = clothing; s.snapshot = { ...style }; s.promptVersion = style.version; s.status = 'generating'; s.error = undefined; s.images = []; s.files = {}; put('session', s); const job = Promise.resolve().then(() => run(s.id)); jobs.add(job); void job.finally(() => jobs.delete(job)); return view(s); });
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
    }>('/api/sessions/:id/orders', async (req) => {
        const s = session(req.params.id), body = object(req.body);
        if (body.imageIds !== undefined && (!Array.isArray(body.imageIds) || body.imageIds.length)) throw fail('套餐在生成前购买，无需选择生成照片。');
        if (body.clothingMode !== undefined && !isClothingMode(body.clothingMode)) throw fail('服装选项无效');
        // Serialize creation against another instance using this SQLite file as well as duplicate clicks.
        db.exec('BEGIN IMMEDIATE');
        try {
            const existing = currentOrder(s.id);
            if (existing?.status === 'paid') { db.exec('COMMIT'); return existing; }
            if (!['photographed', 'failed'].includes(s.status) || !s.photo) throw fail('请先确认拍摄照片；已完成或结果未知的体验不能再次下单。', 409);
            if (body.clothingMode !== undefined) {
                validatePreset(get<Style>('style', s.styleId) ?? get<Style>('retired-style', s.styleId), s.orientation ?? 'portrait', body.clothingMode);
                s.clothingMode = body.clothingMode; put('session', s);
            }
            if (existing?.status === 'pending') { db.exec('COMMIT'); return existing; }
            const order: Order = { id: randomUUID(), sessionId: s.id, product: 'photo-package', imageIds: [], amount: 990, paymentMode: 'simulate', status: 'pending', createdAt: now() };
            put('order', order); db.exec('COMMIT'); return order;
        } catch (error) { db.exec('ROLLBACK'); throw error; }
    });
    app.post<{
        Params: {
            id: string;
        };
    }>('/api/orders/:id/simulate', async (req) => { const o = get<Order>('order', req.params.id); if (!o)
        throw fail('订单不存在', 404); const s = session(o.sessionId, true), outcome = object(req.body).outcome; if (!['paid', 'failed', 'cancelled'].includes(outcome))
        throw fail('支付结果无效'); if (o.status !== 'paid') {
        if (o.product !== 'photo-package' || o.status !== 'pending') throw fail('订单已结束，请创建新的套餐订单。', 409);
        if (!['photographed', 'failed'].includes(s.status) || !s.photo) throw fail('当前照片状态不能付款。', 409);
        o.status = outcome;
        if (outcome === 'paid') {
            s.token ??= randomBytes(32).toString('hex');
            s.pickupUrl = `${base}/pickup/${s.token}`;
            put('session', s);
        }
        put('order', o);
    } return { order: o, session: view(s), pickupUrl: o.status === 'paid' ? s.pickupUrl : undefined }; });
    const pickup = (token: string) => { if (!/^[a-f0-9]{64}$/.test(token))
        throw fail('取图链接不存在', 404); const hash = createHash('sha256').update(token).digest('hex'); const s = all<StoredSession>('session').find(s => s.token === token || s.tokenHash === hash); if (!s)
        throw fail('取图链接不存在', 404); if (s.expiresAt <= now()) {
        erasePhotos(s); throw fail('照片已过期并删除', 410); } const paid = all<Order>('order').filter(o => o.sessionId === s.id && o.status === 'paid'); if (!paid.length) throw fail('取图链接尚未授权', 403); const ids = [...new Set(paid.flatMap(o => o.imageIds))]; return { s, ids, originalAllowed: paid.some(o => o.product === 'photo-package') }; };
    app.get<{
        Params: {
            token: string;
        };
    }>('/api/pickup/:token', async (req): Promise<PickupData> => { const { s, ids, originalAllowed } = pickup(req.params.token); return { status: 'paid', paymentMode: 'simulate', expiresAt: s.expiresAt, mode: s.mode, images: ids.map(id => ({ id, downloadUrl: `/api/pickup/${req.params.token}/images/${id}` })), ...(originalAllowed && s.photo ? { original: { downloadUrl: `/api/pickup/${req.params.token}/original` } } : {}) }; });
    app.get<{ Params: { token: string } }>('/api/pickup/:token/original', async (req, reply) => {
        const { s, originalAllowed } = pickup(req.params.token);
        if (!originalAllowed || !s.photo) throw fail('原照片不存在或未授权', 404);
        return reply.type('image/jpeg').header('Content-Disposition', 'attachment; filename="snap-original.jpg"').send(readFileSync(path.join(data, s.photo)));
    });
    app.get<{
        Params: {
            token: string;
            imageId: string;
        };
    }>('/api/pickup/:token/images/:imageId', async (req, reply) => { const { s, ids } = pickup(req.params.token); if (!ids.includes(req.params.imageId) || !s.files[req.params.imageId])
        throw fail('图片不存在', 404); const image = await framePhoto(readFileSync(path.join(data, s.files[req.params.imageId].full)), selectedFrame(s.id), selectedCaption(s.id));
        pickup(req.params.token); // Decoration may finish after the deadline; never send an expired image.
        return reply.type('image/jpeg').header('Content-Disposition', `attachment; filename="photo-${req.params.imageId}.jpg"`).send(image); });
    app.get('/api/admin', async () => ({ health: health(), styles: all<Style>('style'), sessions: all<StoredSession>('session').sort((a, b) => b.createdAt - a.createdAt).slice(0, 100).map(view), orders: all<Order>('order').sort((a, b) => b.createdAt - a.createdAt).slice(0, 100) }));
    app.get('/api/admin/config', async () => config.status());
    app.put('/api/admin/config', { bodyLimit: 4096 }, async req => {
        if (jobs.size || all<StoredSession>('session').some(s => s.status === 'generating')) throw fail('正在生成照片，请等待完成后再保存配置。', 409);
        const body = object(req.body);
        return config.save(body.apiKey, body.model);
    });
    app.put<{
        Params: {
            id: string;
        };
    }>('/api/admin/styles/:id', async (req) => { const s = get<Style>('style', req.params.id); if (!s)
        throw fail('风格不存在', 404); const b = object(req.body); for (const key of ['name', 'prompt', 'description', 'size', 'exampleUrl'])
        if (typeof b[key] !== 'string' || b[key].length > 12000)
            throw fail(`无效字段：${key}`); if (typeof b.enabled !== 'boolean' || !/^\/(examples|admin-examples)\/[\w./-]+$/.test(b.exampleUrl) || b.exampleUrl.includes('..'))
        throw fail('示例图路径或开关无效'); if (!b.name.trim() || !b.prompt.trim() || !b.size.trim())
        throw fail('名称、提示词和尺寸不能为空'); if (b.enabled && /\{\{[^}]*\}\}/.test(b.prompt)) throw fail('请先将提示词中的 {{占位内容}} 替换为实际主题，再开启风格'); if (b.outfitPrompt !== undefined && (typeof b.outfitPrompt !== 'string' || b.outfitPrompt.length > 4000 || !b.outfitPrompt.trim())) throw fail('换装提示词不能为空且最多 4000 字'); if (s.prompt !== b.prompt || (b.outfitPrompt !== undefined && s.outfitPrompt !== b.outfitPrompt))
        s.version++; if (b.outfitPrompt !== undefined) s.outfitPrompt = b.outfitPrompt; Object.assign(s, ...['name', 'prompt', 'description', 'size', 'exampleUrl', 'enabled'].map(k => ({ [k]: b[k] }))); put('style', s); return s; });
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
