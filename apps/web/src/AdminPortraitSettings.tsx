import { useEffect, useState } from 'react';
import { api } from './api';
import { beautyLevels, type BeautyLevel, type PortraitSettings } from '../../../packages/shared/portrait-settings';

/** Beautification strength goes into the prompt; reference framing pads close-up photos before generation. */
export function AdminPortraitSettings() {
    const [saved, setSaved] = useState<PortraitSettings>();
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    useEffect(() => { api<PortraitSettings>('/api/admin/portrait').then(setSaved).catch(e => setError(e.message)); }, []);
    const save = async (next: PortraitSettings) => {
        if (busy || !saved) return;
        setBusy(true); setError('');
        try { setSaved(await api<PortraitSettings>('/api/admin/portrait', next, 'PUT')); }
        catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    };
    const chooseBeauty = (beauty: BeautyLevel) => { if (saved && beauty !== saved.beauty) void save({ ...saved, beauty }); };
    return <section className="admin-panel portrait-panel"><div className="section-line"><h2>人像处理</h2><span>保存后用于下一次生成</span></div>
        {error && <p className="error" role="alert">{error}</p>}
        <p className="mode-label">美颜强度</p>
        <div className="mode-switch" role="group" aria-label="美颜强度">{beautyLevels.map(level => <button type="button" key={level.id} className={saved?.beauty === level.id ? 'selected' : ''} aria-pressed={saved?.beauty === level.id} disabled={!saved || busy} onClick={() => chooseBeauty(level.id)}>{level.name}</button>)}</div>
        {saved && <p className="mode-note">{beautyLevels.find(level => level.id === saved.beauty)!.note}</p>}
        <label className="checkbox-label portrait-reframe"><input type="checkbox" checked={!!saved?.reframe} disabled={!saved || busy} onChange={e => saved && void save({ ...saved, reframe: e.target.checked })} />参考照片自动构图</label>
        <p className="mode-note">生成前在本机检测人脸：顾客离摄像头太近、头部在画面里占比过大时，自动把照片扩成带正常头身比的半身构图再交给 AI，减少“大头娃娃”。检测不到人脸时按原图生成。</p>
    </section>;
}
