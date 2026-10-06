import { useEffect, useState } from 'react';
import { api } from './api';
import { defaultWifiSettings, validWifi, wifiSecurities, type WifiSettings } from '../../../packages/shared/wifi';

/** The delivery screen shows a join QR for this network before the pickup QR; an empty name hides it. */
export function AdminWifiSettings() {
    const [settings, setSettings] = useState<WifiSettings>(defaultWifiSettings);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
    useEffect(() => {
        let active = true;
        void api<WifiSettings>('/api/admin/wifi').then(value => { if (active) { setSettings(value); setLoaded(true); } }).catch(e => { if (active) setError(e.message); });
        return () => { active = false; };
    }, []);
    const change = (patch: Partial<WifiSettings>) => { setSettings(value => ({ ...value, ...patch })); setMessage(''); };
    return <section className="admin-panel wifi-panel"><div className="section-line"><h2>取图 Wi-Fi</h2><span>顾客扫码自动连网</span></div>
        {error && <p className="error" role="alert">{error}</p>}
        {loaded && <form className="editor-fields" onSubmit={async e => {
            e.preventDefault(); if (busy) return; setBusy(true); setError(''); setMessage('');
            try { setSettings(await api<WifiSettings>('/api/admin/wifi', settings, 'PUT')); setMessage('已保存'); }
            catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
        }}>
            <label>Wi-Fi 名称<input value={settings.ssid} maxLength={32} placeholder="留空则不显示连网二维码" onChange={e => change({ ssid: e.target.value })} /></label>
            <label>加密方式<select value={settings.security} onChange={e => change({ security: e.target.value as WifiSettings['security'] })}>{wifiSecurities.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            {settings.security !== 'nopass' && <label>Wi-Fi 密码<input type="password" autoComplete="new-password" value={settings.password} maxLength={63} onChange={e => change({ password: e.target.value })} /></label>}
            <p className="mode-note">必须是这台设备所在的同一个网络，手机连上后才能打开取图页。</p>
            <button className="primary" disabled={busy || !validWifi(settings)}>{busy ? '保存中…' : '保存'}</button>{message && <p role="status">{message}</p>}
        </form>}
    </section>;
}
