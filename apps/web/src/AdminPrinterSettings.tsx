import { useEffect, useState } from 'react';
import { api } from './api';
import type { PrinterOption, PrinterSettings } from '../../../packages/shared/printing';
interface Inventory { supported: boolean; configured: boolean; settings: PrinterSettings; queues: string[] }
export function AdminPrinterSettings() {
    const [inventory, setInventory] = useState<Inventory>();
    const [settings, setSettings] = useState<PrinterSettings>({ enabled: false, copies: 1, fit: 'contain', paperConfirmed: false });
    const [options, setOptions] = useState<PrinterOption[]>([]);
    const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false);
    const load = async () => { const value = await api<Inventory>('/api/admin/printer'); setInventory(value); setSettings({ copies: 1, fit: 'contain', ...value.settings }); };
    useEffect(() => { let active = true; void api<Inventory>('/api/admin/printer').then(value => { if (active) { setInventory(value); setSettings({ copies: 1, fit: 'contain', ...value.settings }); } }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
    useEffect(() => {
        let active = true; setOptions([]);
        if (!settings.queue) { setLoading(false); return; }
        setLoading(true); setError('');
        void api<{ options: PrinterOption[] }>(`/api/admin/printer/options?queue=${encodeURIComponent(settings.queue)}`).then(value => { if (active) setOptions(value.options); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [settings.queue]);
    const change = (patch: Partial<PrinterSettings>) => { setSettings(value => ({ ...value, ...patch, paperConfirmed: false })); setMessage(''); };
    return <section className="admin-panel"><div className="section-line"><h2>打印机</h2><button type="button" className="text-button" disabled={busy || loading} onClick={async () => { setBusy(true); setError(''); try { await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>刷新</button></div>
        {error && <p className="error" role="alert">{error}</p>}
        {inventory && !inventory.supported && <p>请在连接打印机的 Mac 上设置。</p>}
        {inventory?.supported && <form className="editor-fields" onSubmit={async e => {
            e.preventDefault(); if (busy) return; setBusy(true); setError(''); setMessage('');
            try { setSettings(await api<PrinterSettings>('/api/admin/printer', settings, 'PUT')); setMessage('已保存'); }
            catch (e) { setError((e as Error).message); } finally { setBusy(false); }
        }}><label className="checkbox-label"><input type="checkbox" checked={settings.enabled} onChange={e => change({ enabled: e.target.checked })} />启用打印</label>
        <label>打印机<select value={settings.queue || ''} onChange={e => change({ queue: e.target.value, paper: '', media: '', quality: '' })}><option value="">请选择</option>{inventory.queues.map(queue => <option key={queue}>{queue}</option>)}</select></label>
        {options.map(option => { const field = ({ PageSize: 'paper', MediaType: 'media', EPIJ_Qual: 'quality' } as const)[option.name as 'PageSize' | 'MediaType' | 'EPIJ_Qual']; return <label key={option.name}>{field === 'paper' ? '相纸尺寸' : field === 'media' ? '纸型' : '打印质量'}<select value={settings[field] || ''} onChange={e => change({ [field]: e.target.value })}><option value="">请选择</option>{option.choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label>; })}
        {loading && <p role="status">读取打印机选项…</p>}
        <label>每次张数<input type="number" min={1} max={5} value={settings.copies || 1} onChange={e => change({ copies: Number(e.target.value) })} /></label>
        <label>照片适配<select value={settings.fit || 'contain'} onChange={e => change({ fit: e.target.value as 'contain' | 'cover' })}><option value="contain">完整保留，留白居中</option><option value="cover">裁切铺满</option></select></label>
        <label className="checkbox-label"><input type="checkbox" checked={!!settings.paperConfirmed} onChange={e => setSettings(value => ({ ...value, paperConfirmed: e.target.checked }))} />已确认打印机里装的相纸与以上设置一致</label>
        <button className="primary" disabled={busy || loading || (settings.enabled && (!settings.paperConfirmed || !settings.paper))}>{busy ? '保存中…' : '保存'}</button>{message && <p role="status">{message}</p>}</form>}
    </section>;
}
