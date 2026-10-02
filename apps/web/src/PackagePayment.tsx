import type { Order } from '../../../packages/shared/types';
import { money } from './api';

/** Demo checkout happens before generation; no action here charges a real account. */
export function PackagePayment({ order, photo, theme, busy, onPay }: {
    order: Order; photo: string; theme?: string; busy: boolean;
    onPay: (outcome: 'paid' | 'failed' | 'cancelled') => void;
}) {
    return <section className="payment package-payment">
        <h1>确认套餐</h1>
        <div className="purchase-ticket">
            {photo && <div className="purchase-preview"><img src={photo} alt="套餐使用的拍摄原片" /></div>}
            {theme && <span>{theme}</span>}
            <ul className="package-summary"><li>AI 电子图 + 纸质打印</li><li>含拍摄原片</li></ul>
            <strong>{money(order.amount)}</strong><small className="simulation-notice">示例价 · 模拟付款，不会实际扣款</small>
            <div className="ticket-line" />
            <button className="primary" disabled={busy} onClick={() => onPay('paid')}>{busy ? '正在确认…' : '模拟付款并生成 →'}</button>
            <button className="secondary cancel-purchase" disabled={busy} onClick={() => onPay('cancelled')}>取消付款</button>
            <details className="simulation-options"><summary>异常演示</summary><button className="text-button" disabled={busy} onClick={() => onPay('failed')}>模拟付款失败</button></details>
        </div>
    </section>;
}
