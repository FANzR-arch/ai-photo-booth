import { useEffect, useState } from 'react';
import { api } from './api';
import type { TestSettings } from '../../../packages/shared/types';

type Mode = 'operation' | 'test';
const modes: { id: Mode; name: string; note: string }[] = [
    { id: 'operation', name: '运营模式', note: '正式营业使用。真实 AI 生图，会消耗 API 额度；顾客页面不显示任何测试内容。' },
    { id: 'test', name: '测试模式', note: '调试或培训使用。拍照页可用测试照片，出图在本机模拟，不调用 AI、不消耗额度，效果不代表真实成片。用完请切回运营模式。' },
];

/** Operation hides every test entry and uses real generation; test turns on the sample photo and simulated generation. */
export function AdminTestMode({ onSaved }: { onSaved: () => void }) {
    const [saved, setSaved] = useState<TestSettings>();
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    useEffect(() => { api<TestSettings>('/api/admin/test-mode').then(setSaved).catch(e => setError(e.message)); }, []);
    const mode: Mode | undefined = saved && (saved.testEntries || saved.simulatedGeneration ? 'test' : 'operation');
    const choose = async (next: Mode) => {
        if (busy || !saved || saved.locked || next === mode) return;
        setBusy(true); setError('');
        try { setSaved(await api<TestSettings>('/api/admin/test-mode', { testEntries: next === 'test', simulatedGeneration: next === 'test' }, 'PUT')); onSaved(); }
        catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    };
    return <section className="admin-panel test-mode-panel"><div className="section-line"><h2>模式切换</h2></div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="mode-switch" role="group" aria-label="模式切换">{modes.map(item => <button type="button" key={item.id} className={mode === item.id ? 'selected' : ''} aria-pressed={mode === item.id} disabled={!saved || saved.locked || busy} onClick={() => void choose(item.id)}>{item.name}</button>)}</div>
        {mode && <p className="mode-note">{modes.find(item => item.id === mode)!.note}{saved?.locked && ' 当前以演示方式启动，固定为测试模式。'}</p>}
    </section>;
}
