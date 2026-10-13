/** Orders for pay-before-shooting. The provider is the slot for real WeChat Pay / Alipay; today only the simulation exists.
 *  All routes here are kiosk-local (see the host guard in app.ts). A real provider's payment callback will need its own public route. */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { orderTtlMs, toFen, usablePaymentMode, type Order, type PaymentMode } from '../../packages/shared/payments.js';
import type { PhotoPackage } from '../../packages/shared/photo-packages.js';
const fail = (message: string, statusCode = 400) => Object.assign(Error(message), { statusCode });

export interface PaymentProvider {
    id: Order['provider'];
    /** Register the order with the provider and return what the QR should encode. */
    create(order: Pick<Order, 'id' | 'amount' | 'count' | 'expiresAt'>): Promise<{ qrText: string }>;
    /** Latest state from the provider. Real providers are also confirmed by their callback; this is the polling fallback. */
    query(order: Order): Promise<'pending' | 'paid' | 'closed'>;
    /** Close an unpaid order so it can no longer be paid (visitor went back, timed out or left). */
    close(order: Order): Promise<void>;
}

/** Simulation: the QR is a placeholder and staff (test mode) mark the order paid on the kiosk. Never moves money. */
export const mockProvider: PaymentProvider = {
    id: 'mock',
    create: async order => ({ qrText: `SNAPCLUB-MOCK-PAY:${order.id}:${order.amount}` }),
    query: async order => order.status === 'paid' ? 'paid' : 'pending',
    close: async () => {},
};

interface PaymentOptions {
    now: () => number;
    get: (id: string) => Order | undefined;
    put: (order: Order) => void;
    packages: () => PhotoPackage[];
    mode: () => PaymentMode;
    setMode: (mode: PaymentMode) => void;
    providers?: Partial<Record<Order['provider'], PaymentProvider>>;
}

export function registerPayments(app: FastifyInstance, options: PaymentOptions) {
    const { now, get, put, packages, mode, setMode } = options;
    const providers: Partial<Record<Order['provider'], PaymentProvider>> = { mock: mockProvider, ...options.providers };
    const provider = (id: Order['provider']) => { const p = providers[id]; if (!p) throw fail('收款方式尚未接入', 503); return p; };
    /** Brings a pending order up to date: paid at the provider, or expired here (and closed there). */
    const refresh = async (order: Order) => {
        if (order.status !== 'pending') return order;
        const state = await provider(order.provider).query(order);
        if (state === 'paid') Object.assign(order, { status: 'paid', paidAt: now() });
        else if (state === 'closed') order.status = 'cancelled';
        else if (now() >= order.expiresAt) { order.status = 'expired'; await provider(order.provider).close(order).catch(() => {}); }
        else return order;
        put(order); return order;
    };
    const order = (id: string) => { const value = get(id); if (!value) throw fail('订单不存在', 404); return value; };

    app.get('/api/admin/payment', async () => ({ mode: mode() }));
    app.put('/api/admin/payment', { bodyLimit: 1024 }, async req => {
        const next = (req.body as { mode?: unknown } | undefined)?.mode;
        if (!usablePaymentMode(next)) throw fail('该收款方式尚未接入');
        if (next !== 'off' && (!packages().length || packages().some(item => item.price === undefined))) throw fail('开启扫码付款前，请先给每一档张数填写价格。', 409);
        setMode(next);
        return { mode: mode() };
    });
    app.post('/api/orders', { bodyLimit: 1024 }, async req => {
        const current = mode();
        if (current === 'off') throw fail('本机未开启扫码付款', 409);
        const count = (req.body as { count?: unknown } | undefined)?.count;
        const item = packages().find(p => p.count === count);
        if (!item) throw fail('没有这一档张数');
        if (item.price === undefined) throw fail('这一档还没有定价，请联系工作人员。', 409);
        const created = now();
        const draft = { id: randomUUID(), count: item.count, amount: toFen(item.price), expiresAt: created + orderTtlMs };
        const { qrText } = await provider(current).create(draft);
        const value: Order = { ...draft, status: 'pending', provider: current, qrText, createdAt: created };
        put(value);
        return value;
    });
    app.get<{ Params: { id: string } }>('/api/orders/:id', async req => refresh(order(req.params.id)));
    app.post<{ Params: { id: string } }>('/api/orders/:id/cancel', async req => {
        const value = await refresh(order(req.params.id));
        if (value.status !== 'pending') return value;
        await provider(value.provider).close(value);
        value.status = 'cancelled'; put(value); return value;
    });
    app.post<{ Params: { id: string } }>('/api/orders/:id/simulate-paid', async req => {
        const value = order(req.params.id);
        if (value.provider !== 'mock') throw fail('只有模拟付款可以这样确认', 403);
        if (value.status === 'pending' && now() < value.expiresAt) Object.assign(value, { status: 'paid', paidAt: now() });
        put(value);
        return refresh(value);
    });
    return { mode, order: (id: string) => get(id) };
}
