import { useEffect, useState } from 'react';
import { api } from './api';
import { maxPackages, maxPhotosPerPackage, packageMinutes, validPackages, type PhotoPackage } from '../../../packages/shared/photo-packages';

type Row = { count: string; price: string };
const toRows = (items: PhotoPackage[]): Row[] => items.map(item => ({ count: String(item.count), price: item.price === undefined ? '' : String(item.price) }));
const toPackages = (rows: Row[]): PhotoPackage[] => rows.map(row => ({ count: Number(row.count), ...(row.price.trim() ? { price: Number(row.price) } : {}) }));

/** Photo-count choices shown before a visit. Prices are display-only: money is collected off the machine. */
export function AdminPackageSettings() {
    const [rows, setRows] = useState<Row[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
    useEffect(() => {
        let active = true;
        void api<PhotoPackage[]>('/api/admin/packages').then(value => { if (active) { setRows(toRows(value)); setLoaded(true); } }).catch(e => { if (active) setError(e.message); });
        return () => { active = false; };
    }, []);
    const change = (i: number, patch: Partial<Row>) => { setRows(value => value.map((row, j) => j === i ? { ...row, ...patch } : row)); setMessage(''); };
    const packages = toPackages(rows), valid = validPackages(packages);
    return <section className="admin-panel package-panel"><div className="section-line"><h2>拍照张数与价格</h2><span>顾客开始前选拍几张</span></div>
        {error && <p className="error" role="alert">{error}</p>}
        {loaded && <form className="editor-fields" onSubmit={async e => {
            e.preventDefault(); if (busy || !valid) return; setBusy(true); setError(''); setMessage('');
            try { setRows(toRows(await api<PhotoPackage[]>('/api/admin/packages', { items: packages }, 'PUT'))); setMessage('已保存'); }
            catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
        }}>
            {rows.map((row, i) => <div className="package-row" key={i}>
                <label>张数<input type="number" inputMode="numeric" min={1} max={maxPhotosPerPackage} value={row.count} onChange={e => change(i, { count: e.target.value })} /></label>
                <label>价格（元）<input inputMode="decimal" placeholder="留空则不显示价格" value={row.price} onChange={e => change(i, { price: e.target.value })} /></label>
                <span className="package-time">{Number(row.count) > 0 ? `约 ${packageMinutes(Number(row.count))} 分钟` : ''}</span>
                <button type="button" className="text-button" onClick={() => { setRows(value => value.filter((_, j) => j !== i)); setMessage(''); }}>删除</button>
            </div>)}
            {rows.length < maxPackages && <button type="button" className="secondary" onClick={() => { setRows(value => [...value, { count: '', price: '' }]); setMessage(''); }}>添加一档</button>}
            <p className="mode-note">开启「收款方式」中的扫码付款后，这里的价格就是顾客要付的金额；未开启时价格只用于显示。全部删除后不再询问张数，顾客可以一直拍。每张预计用时按出图约 40 秒、选主题和拍照约 40 秒估算。</p>
            <button className="primary" disabled={busy || !valid}>{busy ? '保存中…' : '保存'}</button>{message && <p role="status">{message}</p>}
            {!valid && <p className="error">每档 1–{maxPhotosPerPackage} 张，张数不能重复；价格填数字或留空。</p>}
        </form>}
    </section>;
}
