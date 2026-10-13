/**
 * Static demo (Cloudflare Pages): the kiosk runs against this in-browser stand-in for the server.
 * Sessions live in memory; "generation" waits ?wait= seconds (default 30) and returns the photo with a warm grade.
 * ?fail=1 makes the next generation fail. Nothing leaves the browser; no Seedream calls, no printing.
 */
import styles from './styles.json';
import { isFortuneId } from '../../../../packages/shared/fortunes';
import { orderTtlMs, toFen, type Order } from '../../../../packages/shared/payments';
import type { Health, PickupData, Session, Style } from '../../../../packages/shared/types';

type DemoSession = Session & { photo?: string; timer?: ReturnType<typeof setTimeout> };
const sessions = new Map<string, DemoSession>();
const params = new URLSearchParams(location.search);
const waitMs = Math.max(3, Number(params.get('wait')) || 30) * 1000;
const failNext = params.get('fail') === '1';
const ttl = 10 * 60 * 1000;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (error: string, status = 400) => json({ error }, status);
const id = () => crypto.randomUUID();
const view = ({ photo, timer, ...s }: DemoSession): Session => ({ ...s, ...(photo ? { originalUrl: photo } : {}) });

const ratio = (o?: string) => o === 'landscape' ? 4 / 3 : o === 'poster' ? 2 / 3 : o === 'landscape3x2' ? 3 / 2 : o === 'portrait4x5' ? 4 / 5 : 3 / 4;
/** Stand-in for the AI photo: the original cropped to the theme's frame and given a warm studio grade. */
async function render(photo: string, orientation?: string) {
    const image = new Image(); image.src = photo; await image.decode();
    const target = ratio(orientation);
    let w = image.naturalWidth, h = image.naturalHeight;
    if (w / h > target) w = h * target; else h = w / target;
    const scale = Math.min(1, 1400 / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.filter = 'saturate(1.35) contrast(1.08) brightness(1.04) sepia(.18)';
    ctx.drawImage(image, (image.naturalWidth - w) / 2, (image.naturalHeight - h) / 2, w, h, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';
    const glow = ctx.createRadialGradient(canvas.width / 2, canvas.height * .4, canvas.width * .2, canvas.width / 2, canvas.height / 2, canvas.width * .85);
    glow.addColorStop(0, '#fff3d900'); glow.addColorStop(1, '#3a1e0a55');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/jpeg', .9));
    return URL.createObjectURL(blob);
}

/** Demo-only placeholder prices so the simulated payment has an amount; real prices are set by staff in the back office. */
const demoPackages = [{ count: 4, price: 39 }, { count: 5, price: 44 }, { count: 6, price: 49 }];
const orders = new Map<string, Order>();
const health: Health = { service: 'snap-club', mode: 'demo', generation: 'demo', testMode: true, configured: true, model: 'demo', imageCount: 1, pickupBaseUrl: location.origin, lanUrls: [], packages: demoPackages, payment: 'mock' };

async function handle(path: string, method: string, body: any): Promise<Response> {
    const [, , kind, sid, action, extra] = path.split('/');
    if (path === '/api/health') return json(health);
    if (path === '/api/styles') return json(styles as Style[]);
    if (path === '/api/wifi') return json(null);
    if (path === '/api/printing') return json({ supported: false, configured: false });
    if (path === '/api/camera/check') return json({ hint: 'unknown' });
    if (kind === 'pickup') {
        const s = [...sessions.values()].find(item => item.pickupUrl?.endsWith(`/pickup/${sid}`));
        if (!s) return fail('演示版的相册只保存在拍照这台设备的当前页面里，手机扫码打不开。', 404);
        return json({ expiresAt: s.expiresAt, mode: 'demo', images: s.images.map(i => ({ id: i.id, downloadUrl: i.previewUrl })), ...(s.decoratedUrl ? { decorated: { downloadUrl: s.decoratedUrl } } : {}), ...(s.photo ? { original: { downloadUrl: s.photo } } : {}) } satisfies PickupData);
    }
    if (kind === 'orders') {
        if (!sid && method === 'POST') {
            const item = demoPackages.find(p => p.count === body?.count);
            if (!item) return fail('没有这一档张数');
            const now = Date.now(), order: Order = { id: id(), count: item.count, amount: toFen(item.price), status: 'pending', provider: 'mock', qrText: '', createdAt: now, expiresAt: now + orderTtlMs };
            order.qrText = `SNAPCLUB-MOCK-PAY:${order.id}:${order.amount}`;
            orders.set(order.id, order); return json(order);
        }
        const order = orders.get(sid);
        if (!order) return fail('订单不存在', 404);
        if (order.status === 'pending' && Date.now() >= order.expiresAt) order.status = 'expired';
        if (action === 'cancel' && order.status === 'pending') order.status = 'cancelled';
        if (action === 'simulate-paid' && order.status === 'pending') Object.assign(order, { status: 'paid', paidAt: Date.now() });
        return json(order);
    }
    if (kind !== 'sessions') return fail('演示版不提供后台设置', 404);
    if (!sid && method === 'POST') {
        const style = (styles as Style[]).find(item => item.id === body?.styleId && item.enabled);
        if (!style) return fail('风格不可用');
        const now = Date.now();
        const s: DemoSession = { id: id(), styleId: style.id, styleName: style.name, purpose: body.purpose ?? 'self', orientation: style.sceneOrientation ?? (style.generationPreset === 'coming-of-age' ? 'poster' : 'portrait'), clothingMode: style.generationPreset ? 'theme' : 'keep', status: 'created', mode: 'demo', createdAt: now, expiresAt: now + 30 * 60 * 1000, images: [], frame: 'none' };
        sessions.set(s.id, s); return json(view(s));
    }
    const s = sessions.get(sid);
    if (!s) return fail('会话不存在', 404);
    if (!action) return json(view(s));
    if (action === 'end') { clearTimeout(s.timer); s.status = 'ended'; sessions.delete(s.id); return json({ ok: true }); }
    if (action === 'photo') { s.photo = body.dataUrl; s.orientation = body.orientation ?? s.orientation; s.clothingMode = body.clothingMode ?? s.clothingMode; s.status = 'photographed'; return json(view(s)); }
    if (action === 'frame') { s.frame = body.frame; s.caption = body.caption ?? s.caption; return json({ frame: s.frame, caption: s.caption }); }
    if (action === 'fortune') { if (!isFortuneId(body.fortune)) return fail('签文无效'); s.fortune = body.fortune; return json(view(s)); }
    if (action === 'decorated') { s.decoratedUrl = body.dataUrl ?? undefined; return json(view(s)); }
    if (action === 'print') return extra ? json({ job: null }) : fail('演示版不能打印', 409);
    if (action === 'generate') {
        if (['generating', 'ready', 'partial'].includes(s.status)) return json(view(s));
        if (!s.photo) return fail('请先拍照', 409);
        const shouldFail = failNext && !s.error;
        Object.assign(s, { status: 'generating', startedAt: Date.now(), error: undefined, images: [], pickupUrl: s.pickupUrl ?? `${location.origin}/pickup/${id().replace(/-/g, '')}${id().replace(/-/g, '')}` });
        s.timer = setTimeout(async () => {
            if (shouldFail) { Object.assign(s, { status: 'failed', error: '演示：模拟生成失败' }); return; }
            const previewUrl = await render(s.photo!, s.orientation);
            const done = Date.now();
            Object.assign(s, { status: 'ready', images: [{ id: id(), previewUrl }], completedAt: done, expiresAt: done + ttl, elapsedMs: done - (s.startedAt ?? done) });
        }, waitMs);
        return json(view(s));
    }
    return fail('演示版不支持此操作', 404);
}

export function installDemoApi() {
    // The demo opens in the Memphis pop skin unless the visitor already picked one in staff settings.
    try { if (!localStorage.getItem('snap-skin')) localStorage.setItem('snap-skin', 'memphis'); } catch { /* storage blocked: default skin */ }
    const real = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
        if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return real(input, init);
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        return handle(url.pathname, (init?.method ?? 'GET').toUpperCase(), body);
    };
}
