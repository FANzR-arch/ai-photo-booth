import { fenText, type Order } from '../../../packages/shared/payments';
import { packageMinutes } from '../../../packages/shared/photo-packages';
import { timeLeft } from './PhotoLibrary';

/** Pay before shooting: what is being bought on the left, the payment QR on the right. Payment is detected by polling, so there is no "I paid" button. */
export function PayScreen({ order, qr, now, busy, onBack, onRenew, onSimulate }: {
    order: Order; qr: string; now: number; busy: boolean;
    onBack: () => void; onRenew: () => void; onSimulate?: () => void;
}) {
    const expired = order.status === 'expired' || order.status === 'cancelled' || (order.status === 'pending' && now >= order.expiresAt);
    return <section className="theme-screen pay-screen" aria-label="扫码付款">
        <div className="theme-heading"><button className="secondary" disabled={busy} onClick={onBack}>← 返回</button><h1>扫码付款</h1></div>
        <div className="pay-layout">
            <div className="pay-summary">
                <strong>{order.count}<small>张</small></strong>
                <span>约 {packageMinutes(order.count)} 分钟</span>
                <b className="pay-amount">{fenText(order.amount)}</b>
            </div>
            <div className="pay-code">
                {expired ? <div className="pay-expired" role="status"><strong>付款码已过期</strong><p>没有扣款。需要的话重新生成一个。</p><button className="primary" disabled={busy} onClick={onRenew}>重新生成付款码</button></div>
                    : <>
                        <p className="pay-title">用微信或支付宝扫一扫</p>
                        {qr ? <img src={qr} alt="付款二维码" /> : <p className="pay-wait">正在生成付款码…</p>}
                        <p className="pay-countdown"><b>{timeLeft(order.expiresAt, now)}</b> 后失效 · 付款后自动开始</p>
                        {order.provider === 'mock' && <p className="pay-mock">测试付款码，扫码不会扣钱</p>}
                        {onSimulate && <button className="secondary pay-simulate" disabled={busy} onClick={onSimulate}>模拟付款成功（测试）</button>}
                    </>}
            </div>
        </div>
    </section>;
}
