import { useEffect, useState } from 'react';
import { api } from './api';
interface Config {
    keyConfigured: boolean;
    model: string;
    restartRequired: boolean;
}
export function AdminProviderSettings({ onSaved }: { onSaved?: () => void }) {
    const [config, setConfig] = useState<Config>();
    const [key, setKey] = useState(''), [model, setModel] = useState('');
    const [message, setMessage] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    useEffect(() => {
        let active = true;
        void api<Config>('/api/admin/config').then(value => { if (active) { setConfig(value); setModel(value.model); } }).catch(e => { if (active) setError(e.message); });
        return () => { active = false; };
    }, []);
    return <section className="admin-panel"><div className="section-line"><h2>API 设置</h2></div>
        {error && <p className="error" role="alert">{error}</p>}
        {!config && !error && <p role="status">加载中…</p>}
        {config && <>
        {config.restartRequired && <p className="admin-notice">配置有变更，请保存。</p>}
        <form className="editor-fields" onSubmit={async e => {
            e.preventDefault(); if (busy) return; setBusy(true); setError(''); setMessage('');
            try { const saved = await api<Config>('/api/admin/config', { apiKey: key, model }, 'PUT'); setConfig(saved); setKey(''); setMessage('已保存'); onSaved?.(); }
            catch (cause) { setError((cause as Error).message); }
            finally { setBusy(false); }
        }}><label>API 密钥<input type="password" autoComplete="new-password" placeholder={config.keyConfigured ? '已保存，留空保留' : '输入 API 密钥'} value={key} maxLength={1024} onChange={e => setKey(e.target.value)} /></label><label>模型 ID<input value={model} maxLength={200} onChange={e => setModel(e.target.value)} placeholder="模型 ID" required /></label><button className="primary" disabled={busy || !model.trim() || (!config.keyConfigured && !key.trim())}>{busy ? '保存中…' : '保存'}</button>{message && <p role="status">{message}</p>}</form></>}
    </section>;
}
