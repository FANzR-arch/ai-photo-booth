import { useEffect, useState } from 'react';
import type { Health, Session, Style } from '../../../packages/shared/types';
import { api, readFile } from './api';
import { Brand } from './Brand';
import { StyleImage } from './StyleImage';
import { AdminAccess } from './AdminAccess';
import { AdminProviderSettings } from './AdminProviderSettings';
import { AdminTestMode } from './AdminTestMode';
import { AdminPortraitSettings } from './AdminPortraitSettings';
import { AdminCameraSettings } from './AdminCameraSettings';
import { AdminPrinterSettings } from './AdminPrinterSettings';
import { AdminPasswordSettings } from './AdminPasswordSettings';
import { photoCategories, photoCategoryFor } from '../../../packages/shared/photo-categories';
/** Same subjects and order as the booth gallery, but disabled styles stay listed so they can be edited. */
const styleGroups = (styles: Style[]) => photoCategories.map(category => {
    const order: readonly string[] = category.styles;
    const rank = (style: Style) => order.includes(style.id) ? order.indexOf(style.id) : order.length;
    return { ...category, items: styles.filter(style => photoCategoryFor(style.id) === category.id).sort((a, b) => rank(a) - rank(b)) };
}).filter(group => group.items.length > 0);
interface AdminData {
    health: Health;
    styles: Style[];
    sessions: Session[];
}
function StyleEditor({ style, onSaved }: {
    style: Style;
    onSaved: () => void;
}) { const [draft, setDraft] = useState(style); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const save = async () => { setBusy(true); setMessage(''); try {
    const updated = await api<Style>(`/api/admin/styles/${style.id}`, { name: draft.name, description: draft.description, prompt: draft.prompt, outfitPrompt: draft.outfitPrompt, enabled: draft.enabled, exampleUrl: draft.exampleUrl, size: draft.size }, 'PUT');
    setDraft(updated);
    setMessage('已保存');
    onSaved();
}
catch (e) {
    setMessage((e as Error).message);
}
finally {
    setBusy(false);
} }; return <details className="style-editor"><summary><StyleImage src={draft.exampleUrl} alt="风格参考"/><span><strong>{draft.name}</strong><small>提示词 v{draft.version} · {draft.enabled ? '已开启' : '已关闭'}</small></span><span>编辑 ↙</span></summary><div className="editor-fields">{/\{\{[^}]*\}\}/.test(draft.prompt || "") && <p className="error" role="status">主题尚未配置：请将提示词中的 {draft.prompt?.match(/\{\{[^}]*\}\}/g)?.join("、")} 替换为实际内容，再开启风格。当前示例为意向参考，非实测成片。</p>}<div className="field-row"><label>风格名称<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label><label>输出尺寸<input value={draft.size} onChange={e => setDraft({ ...draft, size: e.target.value })}/><small>HQ 为本项目已实测的约 220 万像素画幅；也可按模型文档填写具体尺寸。</small></label></div><label>风格介绍<input value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}/></label><label>主题视觉提示词<textarea rows={8} value={draft.prompt || ''} onChange={e => setDraft({ ...draft, prompt: e.target.value })}/></label><small>描述背景、光线、动作和画面风格。场景模板包含完整造型与指定文字；成人礼使用固定换装，其余可选择保留原服装。</small><label>换装搭配提示词<textarea rows={4} value={draft.outfitPrompt || ''} placeholder="描述本主题的衣服款式、颜色与材质，仅在选择换装时使用。" onChange={e => setDraft({ ...draft, outfitPrompt: e.target.value })}/></label><label className="checkbox-label"><input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })}/>在拍照首页开启</label><label className="upload-link">更换示例图（JPG / PNG）<input type="file" accept="image/jpeg,image/png" disabled={busy} onChange={async (e) => { const file = e.target.files?.[0]; if (!file)
    return; setBusy(true); try {
    const dataUrl = await readFile(file);
    const result = await api<{
        url: string;
    }>('/api/admin/examples', { dataUrl });
    setDraft({ ...draft, exampleUrl: result.url });
    setMessage('示例已上传，请保存风格');
}
catch (e) {
    setMessage((e as Error).message);
}
finally {
    setBusy(false);
} }}/></label><div className="button-row"><button className="primary" disabled={busy || !draft.name.trim() || !draft.prompt?.trim()} onClick={save}>{busy ? '处理中…' : '保存风格'}</button><span role="status">{message}</span></div></div></details>; }
function AdminWorkspace({ onLock }: { onLock: () => Promise<void> }) { const [data, setData] = useState<AdminData>(); const [error, setError] = useState(''); const refresh = () => api<AdminData>('/api/admin').then(setData).catch(e => setError(e.message)); useEffect(() => { void refresh(); }, []); return <div className="shell admin"><header><Brand /><div className="admin-actions"><button className="secondary" onClick={() => void onLock()}>锁定工作台</button><a className="button secondary" href="/" onClick={e => { e.preventDefault(); void onLock().then(() => location.assign('/') ); }}>返回拍照亭 ↗</a></div></header><main><h1>设备设置</h1>{error && <div className="error" role="alert">{error}</div>}{!data && !error && <p role="status">正在读取设备信息…</p>}{data && <><AdminProviderSettings onSaved={() => void refresh()} /><AdminTestMode onSaved={() => void refresh()} /><AdminPortraitSettings /><AdminPasswordSettings /><div className="network-info"><b>手机取图地址</b><p>{data.health.pickupBaseUrl}</p></div><AdminCameraSettings /><AdminPrinterSettings /><section><div className="section-line"><h2>01 / 风格与提示词</h2><span>保存后用于下一次生成</span></div>{styleGroups(data.styles).map(group => <div key={group.id} className="style-group"><h3>{group.name}<small>{group.items.length} 款 · {group.note}</small></h3><div className="style-grid">{group.items.map(style => <StyleEditor key={style.id} style={style} onSaved={() => void refresh()}/>)}</div></div>)}</section><section><div className="section-line"><h2>02 / 生成记录</h2><button className="text-button" onClick={() => void refresh()}>刷新 ↻</button></div><div className="table-scroll"><table><thead><tr><th>时间 / 会话</th><th>风格 / 模式</th><th>状态</th><th>耗时</th><th>备注</th></tr></thead><tbody>{data.sessions.map(s => <tr key={s.id}><td>{new Date(s.createdAt).toLocaleString('zh-CN')}<small>{s.id.slice(0, 12)}</small></td><td>{s.styleName}<small>{s.mode === 'demo' ? '本机处理' : '云端处理'} · v{s.promptVersion || '—'}</small></td><td>{s.status}<small>{s.images.length} 张</small></td><td>{s.elapsedMs ? `${(s.elapsedMs / 1000).toFixed(1)}s` : '—'}</td><td>{s.error || '—'}{s.requestId && <small>请求：{s.requestId}</small>}</td></tr>)}</tbody></table>{!data.sessions.length && <p className="empty">还没有生成记录，回到拍照亭开始一次体验。</p>}</div></section></>}</main></div>; }

export function Admin() { return <AdminAccess>{onLock => <AdminWorkspace onLock={onLock} />}</AdminAccess>; }
