import { useEffect, useState } from 'react';
import { api } from './api';
import type { TestSettings } from '../../../packages/shared/types';

/** Normal operation keeps both switches off; the kiosk then shows nothing test-related. */
export function AdminTestMode({ onSaved }: { onSaved: () => void }) {
    const [saved, setSaved] = useState<TestSettings>();
    const [draft, setDraft] = useState({ testEntries: false, simulatedGeneration: false });
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
    useEffect(() => {
        api<TestSettings>('/api/admin/test-mode').then(value => { setSaved(value); setDraft({ testEntries: value.testEntries, simulatedGeneration: value.simulatedGeneration }); }).catch(e => setError(e.message));
    }, []);
    const changed = !!saved && (saved.testEntries !== draft.testEntries || saved.simulatedGeneration !== draft.simulatedGeneration);
    const save = async () => {
        setBusy(true); setError(''); setMessage('');
        try {
            const value = await api<TestSettings>('/api/admin/test-mode', draft, 'PUT');
            setSaved(value); setMessage(value.testEntries || value.simulatedGeneration ? '已保存，测试设置已对下一位顾客生效。' : '已保存，已恢复正常运营模式。'); onSaved();
        } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    };
    const active = !!saved && (saved.testEntries || saved.simulatedGeneration);
    return <section className="admin-panel test-mode-panel"><div className="section-line"><h2>测试模式</h2><span className={active ? 'test-mode-state is-on' : 'test-mode-state'}>{!saved ? '读取中…' : active ? '测试中' : '正常运营'}</span></div>
        <p className="muted">正常运营时两项都保持关闭，拍照亭不显示任何测试内容。只在调试、培训或演示时打开，用完请关闭。</p>
        {saved?.locked && <p className="error">当前以演示方式启动，测试模式固定开启。正式运营请用「启动拍照亭」启动。</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="editor-fields">
            <label className="test-mode-option"><input type="checkbox" checked={draft.testEntries} disabled={!saved || saved.locked || busy} onChange={e => setDraft(d => ({ ...d, testEntries: e.target.checked }))} /><span><strong>显示测试入口</strong><small>拍照页出现「使用测试照片」，顶部显示「测试模式」标签。</small></span></label>
            <label className="test-mode-option"><input type="checkbox" checked={draft.simulatedGeneration} disabled={!saved || saved.locked || busy} onChange={e => setDraft(d => ({ ...d, simulatedGeneration: e.target.checked }))} /><span><strong>使用模拟出图</strong><small>新照片在本机模拟处理，不调用 Seedream、不消耗额度；效果不代表 AI 成片。</small></span></label>
            <div className="button-row"><button className="primary" disabled={!changed || busy || saved?.locked} onClick={() => void save()}>{busy ? '正在保存…' : '保存测试设置'}</button></div>
            <p role="status">{message}</p>
        </div>
    </section>;
}
