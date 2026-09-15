import { useEffect, useState } from 'react';
import type { Health, Session, Style, Order } from '../../../packages/shared/types';
import { api, readFile, money } from './api';
import { StyleImage } from './StyleImage';
interface AdminData {
    health: Health;
    styles: Style[];
    sessions: Session[];
    orders: Order[];
}
function StyleEditor({ style, onSaved }: {
    style: Style;
    onSaved: () => void;
}) { const [draft, setDraft] = useState(style); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const save = async () => { setBusy(true); setMessage(''); try {
    const updated = await api<Style>(`/api/admin/styles/${style.id}`, { name: draft.name, description: draft.description, prompt: draft.prompt, enabled: draft.enabled, exampleUrl: draft.exampleUrl, size: draft.size }, 'PUT');
    setDraft(updated);
    setMessage('已保存');
    onSaved();
}
catch (e) {
    setMessage((e as Error).message);
}
finally {
    setBusy(false);
} }; return <details className="style-editor"><summary><StyleImage src={draft.exampleUrl} alt="风格参考"/><span><strong>{draft.name}</strong><small>提示词 v{draft.version} · {draft.enabled ? '已开启' : '已关闭'}</small></span><span>编辑 ↙</span></summary><div className="editor-fields">{/\{\{[^}]*\}\}/.test(draft.prompt || "") && <p className="error" role="status">主题尚未配置：请将提示词中的 {draft.prompt?.match(/\{\{[^}]*\}\}/g)?.join("、")} 替换为实际内容，再开启风格。当前示例为意向参考，非实测成片。</p>}<div className="field-row"><label>风格名称<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label><label>输出尺寸<input value={draft.size} onChange={e => setDraft({ ...draft, size: e.target.value })}/><small>按所选模型文档填写尺寸，当前 5.0 pro 使用 1.5K；支持范围由模型决定。</small></label></div><label>风格介绍<input value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}/></label><label>生成提示词<textarea rows={8} value={draft.prompt || ''} onChange={e => setDraft({ ...draft, prompt: e.target.value })}/></label><label className="checkbox-label"><input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })}/>在拍照首页开启</label><label className="upload-link">更换示例图（JPG / PNG）<input type="file" accept="image/jpeg,image/png" disabled={busy} onChange={async (e) => { const file = e.target.files?.[0]; if (!file)
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
export function Admin() { const [data, setData] = useState<AdminData>(); const [error, setError] = useState(''); const refresh = () => api<AdminData>('/api/admin').then(setData).catch(e => setError(e.message)); useEffect(() => { void refresh(); }, []); return <div className="shell admin"><header><a className="brand" href="/">✳ 咔嚓！<small>SNAP CLUB</small></a><a className="button secondary" href="/">返回拍照亭 ↗</a></header><main><span className="eyebrow">BEHIND THE SCENES</span><h1>照相馆<em>工作台。</em></h1><p>仅本机访问 · 风格设置与生成记录</p>{error && <div className="error" role="alert">{error}</div>}{!data && !error && <p role="status">正在读取设备信息…</p>}{data && <><section className="admin-status"><div><span>当前模式</span><strong>{data.health.mode === 'demo' ? '演示效果 · 非 AI' : 'Seedream 云端'}</strong></div><div><span>API 配置</span><strong>{data.health.mode === 'demo' ? '演示无需密钥' : data.health.configured ? '已配置' : '未配置'}</strong></div><div><span>每次生成</span><strong>{data.health.imageCount} 张</strong></div><div><span>模型</span><strong>{data.health.model || '尚未设置'}</strong></div></section><p className="muted">API 密钥、模型与运行模式通过项目 .env 配置，修改后重启服务。此页面不会显示密钥。</p><div className="network-info"><b>手机取图地址</b><p>{data.health.pickupBaseUrl}</p>{data.health.lanUrls.map(url => <code key={url}>{url} </code>)}</div><section><div className="section-line"><h2>01 / 风格与提示词</h2><span>保存后用于下一次生成</span></div>{data.styles.map(style => <StyleEditor key={style.id} style={style} onSaved={() => void refresh()}/>)}</section><section><div className="section-line"><h2>02 / 生成记录</h2><button className="text-button" onClick={() => void refresh()}>刷新 ↻</button></div><div className="table-scroll"><table><thead><tr><th>时间 / 会话</th><th>风格 / 模式</th><th>状态</th><th>耗时</th><th>备注</th></tr></thead><tbody>{data.sessions.map(s => <tr key={s.id}><td>{new Date(s.createdAt).toLocaleString('zh-CN')}<small>{s.id.slice(0, 12)}</small></td><td>{s.styleName}<small>{s.mode} · v{s.promptVersion || '—'}</small></td><td>{s.status}<small>{s.images.length} 张</small></td><td>{s.elapsedMs ? `${(s.elapsedMs / 1000).toFixed(1)}s` : '—'}</td><td>{s.error || '—'}{s.requestId && <small>请求：{s.requestId}</small>}</td></tr>)}</tbody></table>{!data.sessions.length && <p className="empty">还没有生成记录，回到拍照亭开始一次体验。</p>}</div></section><section><div className="section-line"><h2>03 / 模拟订单</h2><span>所有订单均不实际扣款</span></div><div className="table-scroll"><table><thead><tr><th>时间</th><th>订单</th><th>图片</th><th>金额</th><th>状态</th></tr></thead><tbody>{data.orders.map(o => <tr key={o.id}><td>{new Date(o.createdAt).toLocaleString('zh-CN')}</td><td>{o.id.slice(0, 12)}</td><td>{o.imageIds.length} 张</td><td>{money(o.amount)}</td><td>{o.status}</td></tr>)}</tbody></table>{!data.orders.length && <p className="empty">还没有模拟订单。</p>}</div></section></>}</main><footer>SNAP CLUB · LOCAL WORKSPACE</footer></div>; }
