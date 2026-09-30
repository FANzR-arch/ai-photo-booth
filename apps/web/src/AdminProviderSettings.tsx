import { useEffect, useState } from 'react';
import { api } from './api';
interface Config {
    keyConfigured: boolean; keyHint: string; model: string; activeConfigured: boolean;
    activeModel: string; restartRequired: boolean; providerVerified: boolean;
}
export function AdminProviderSettings({ onSaved }: { onSaved?: () => void }) {
    const [config, setConfig] = useState<Config>();
    const [key, setKey] = useState(''), [model, setModel] = useState('');
    const [message, setMessage] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const load = async () => {
        const value = await api<Config>('/api/admin/config'); setConfig(value); setModel(value.model);
    };
    useEffect(() => { let active = true; void api<Config>('/api/admin/config').then(value => { if (active) { setConfig(value); setModel(value.model); } }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
    return <section className="admin-panel"><div className="section-line"><h2>生图服务</h2><span>本机配置</span></div>
        <p className="muted">填写你自己的 API 密钥和模型 ID，保存后即可用于下一次生成。</p>
        {error && <p className="error" role="alert">{error}</p>}
        {config && <><div className="admin-checklist"><span>已保存密钥：<b>{config.keyConfigured ? config.keyHint : '尚未设置'}</b></span><span>当前服务配置：<b>{config.activeConfigured ? '已加载' : '未加载'}</b></span><span>模型权限及额度：<b>待实际生成验收</b></span></div>
        {config.restartRequired && <p className="admin-notice">磁盘配置与当前运行配置不同，点击保存即可应用。</p>}
        <form className="editor-fields" onSubmit={async e => {
            e.preventDefault(); if (busy) return; setBusy(true); setError(''); setMessage('');
            try { const saved = await api<Config>('/api/admin/config', { apiKey: key, model }, 'PUT'); setConfig(saved); setKey(''); setMessage('已保存并生效，可以返回拍照亭。'); onSaved?.(); }
            catch (cause) { setError((cause as Error).message); }
            finally { setBusy(false); }
        }}><label>Seedream API 密钥<input type="password" autoComplete="new-password" placeholder={config.keyConfigured ? '留空保留已保存的密钥' : '填写 API 密钥'} value={key} maxLength={1024} onChange={e => setKey(e.target.value)} /></label><label>模型 ID<input value={model} maxLength={200} onChange={e => setModel(e.target.value)} placeholder="填写服务商提供的模型 ID" required /></label><div className="button-row"><button className="primary" disabled={busy || !model.trim() || (!config.keyConfigured && !key.trim())}>{busy ? '正在保存…' : '保存配置'}</button><button type="button" className="secondary" disabled={busy} onClick={async () => { setError(''); setMessage(''); setBusy(true); try { await load(); setKey(''); setMessage('已重新读取本机配置。尚未验证服务商授权或额度。'); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); } }}>检查本机配置</button></div><p role="status">{message}</p></form></>}
    </section>;
}
