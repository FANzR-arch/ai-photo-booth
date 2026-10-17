import { useEffect, useState } from 'react';
import { api } from './api';
import { validPrice } from '../../../packages/shared/photo-packages';

/** Each visit is one photo; staff only set its price. Display-only unless the machine takes payment. */
export function AdminPackageSettings() {
    const [price, setPrice] = useState('');
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
    useEffect(() => {
        let active = true;
        void api<{ price?: number }>('/api/admin/price').then(value => { if (active) { setPrice(value.price === undefined ? '' : String(value.price)); setLoaded(true); } }).catch(e => { if (active) setError(e.message); });
        return () => { active = false; };
    }, []);
    const value = price.trim() ? Number(price) : undefined, valid = validPrice(value);
    return <section className="admin-panel package-panel"><div className="section-line"><h2>拍照价格</h2><span>每次只拍 1 张</span></div>
        {error && <p className="error" role="alert">{error}</p>}
        {loaded && <form className="editor-fields" onSubmit={async e => {
            e.preventDefault(); if (busy || !valid) return; setBusy(true); setError(''); setMessage('');
            try { const saved = await api<{ price?: number }>('/api/admin/price', { price: value ?? null }, 'PUT'); setPrice(saved.price === undefined ? '' : String(saved.price)); setMessage('已保存'); }
            catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
        }}>
            <div className="package-row"><label>价格（元）<input inputMode="decimal" placeholder="留空则不显示价格" value={price} onChange={e => { setPrice(e.target.value); setMessage(''); }} /></label></div>
            <p className="mode-note">顾客点「开始拍照」后直接选主题，每次拍 1 张。开启「收款方式」中的扫码付款后，这里的价格就是顾客要付的金额；未开启时价格只在首页显示。</p>
            <button className="primary" disabled={busy || !valid}>{busy ? '保存中…' : '保存'}</button>{message && <p role="status">{message}</p>}
            {!valid && <p className="error">价格填 0–9999 的数字，最多两位小数，或留空。</p>}
        </form>}
    </section>;
}
