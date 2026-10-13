import { useEffect, useState } from 'react';
import { api } from './api';
import { paymentModes, type PaymentMode } from '../../../packages/shared/payments';

/** Whether the booth asks for payment by QR after the photo count is chosen. Real providers are listed but not wired yet. */
export function AdminPaymentSettings() {
    const [mode, setMode] = useState<PaymentMode>();
    const [saved, setSaved] = useState<PaymentMode>();
    const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
    useEffect(() => {
        let active = true;
        void api<{ mode: PaymentMode }>('/api/admin/payment').then(value => { if (active) { setMode(value.mode); setSaved(value.mode); } }).catch(e => { if (active) setError(e.message); });
        return () => { active = false; };
    }, []);
    return <section className="admin-panel payment-panel"><div className="section-line"><h2>收款方式</h2><span>选好张数后扫码付款</span></div>
        {error && <p className="error" role="alert">{error}</p>}
        {mode && <form className="editor-fields" onSubmit={async e => {
            e.preventDefault(); if (busy) return; setBusy(true); setError(''); setMessage('');
            try { const value = await api<{ mode: PaymentMode }>('/api/admin/payment', { mode }, 'PUT'); setMode(value.mode); setSaved(value.mode); setMessage('已保存'); }
            catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
        }}>
            <label>收款方式<select value={mode} onChange={e => { setMode(e.target.value as PaymentMode); setMessage(''); }}>{paymentModes.map(item => <option key={item.id} value={item.id} disabled={!item.available}>{item.name}</option>)}</select></label>
            <p className="mode-note">开启扫码付款后，每一档张数都必须有价格；顾客付款成功才能开始拍，拍满张数后不能再拍。模拟付款只在测试模式下显示「模拟付款成功」按钮，不会真正扣款。</p>
            <button className="primary" disabled={busy || mode === saved}>{busy ? '保存中…' : '保存'}</button>{message && <p role="status">{message}</p>}
        </form>}
    </section>;
}
