/** Pay-before-shooting: the visitor picks a photo package, scans a QR to pay, then starts.
 *  Only a simulated provider exists today; real WeChat Pay / Alipay plug in behind the same server interface (apps/server/payments.ts). */
export const paymentModes = [
    { id: 'off', name: '现场收费（机器不收款）', available: true },
    { id: 'mock', name: '模拟扫码付款（测试用，不会真正扣款）', available: true },
    { id: 'wechat', name: '微信支付（尚未接入）', available: false },
    { id: 'alipay', name: '支付宝（尚未接入）', available: false },
] as const;
export type PaymentMode = typeof paymentModes[number]['id'];
export const isPaymentMode = (value: unknown): value is PaymentMode => paymentModes.some(mode => mode.id === value);
export const usablePaymentMode = (value: unknown): value is PaymentMode => paymentModes.some(mode => mode.id === value && mode.available);

export type OrderStatus = 'pending' | 'paid' | 'expired' | 'cancelled';
export interface Order {
    id: string;
    /** Photos this order pays for. */
    count: number;
    /** Amount in fen (分), so money never goes through floating point. */
    amount: number;
    status: OrderStatus;
    provider: Exclude<PaymentMode, 'off'>;
    /** What the payment QR encodes: a provider pay URL for real payments, a placeholder for the simulation. */
    qrText: string;
    createdAt: number;
    expiresAt: number;
    paidAt?: number;
}
/** How long a payment QR stays valid; shorter than the 5-minute idle limit on the pay screen, so the code expires before the visit is cleared. */
export const orderTtlMs = 3 * 60_000;
export const toFen = (yuan: number) => Math.round(yuan * 100);
export const fenText = (fen: number) => `¥${fen % 100 ? (fen / 100).toFixed(2) : fen / 100}`;
