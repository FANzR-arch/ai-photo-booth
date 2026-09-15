import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { AttractScreen } from './AttractScreen';
import { ThemePicker } from './ThemePicker';
import { DisplayControls } from './DisplayControls';
import type { Health, Session, Style, Order } from '../../../packages/shared/types';
import { api, readFile, money } from './api';
function Brand() { return <a className="brand" href="/" aria-label="咔嚓照相馆首页"><span className="brand-mark">✳</span><span>咔嚓！<small>SNAP CLUB · 照相馆</small></span></a>; }
export function Pickup() { const [data, setData] = useState<{
    expiresAt: number;
    mode: string;
    images: {
        id: string;
        downloadUrl: string;
    }[];
}>(); const [error, setError] = useState(''); useEffect(() => { api<any>(`/api${location.pathname}`).then(setData).catch(e => setError(e.message)); }, []); return <div className="shell"><header><Brand /></header><main className="pickup"><h1>你的照片</h1>{error ? <div role="alert" className="error">{error}</div> : !data ? <p role="status">正在打开你的相册…</p> : <><p>{data.mode === 'demo' ? '演示效果图 · 非 AI 生成' : '你的高清照片已解锁'} · 模拟购买，无实际扣款</p><p className="muted">请在 {new Date(data.expiresAt).toLocaleString('zh-CN')} 前下载。</p><div className="results-grid">{data.images.map((item, i) => <article className="photo-print" key={item.id}><img src={item.downloadUrl} alt={`已解锁高清照片 ${i + 1}`}/><a className="button primary" download href={item.downloadUrl}>下载照片 {i + 1} ↗</a></article>)}</div><p className="muted">如微信内无法直接保存，请用手机浏览器打开此链接。</p></>}</main></div>; }
export function Booth() {
    const [health, setHealth] = useState<Health>();
    const [styles, setStyles] = useState<Style[]>([]);
    const [stylesLoading, setStylesLoading] = useState(false);
    const [configAttempt, setConfigAttempt] = useState(0);
    const [session, setSession] = useState<Session>();
    const [step, setStep] = useState('home');
    const [photo, setPhoto] = useState('');
    const [error, setError] = useState('');
    const [cameraError, setCameraError] = useState('');
    const [busy, setBusy] = useState(false);
    const [count, setCount] = useState(0);
    const [consent, setConsent] = useState(false);
    const [selected, setSelected] = useState<string[]>([]);
    const [order, setOrder] = useState<Order>();
    const [pickup, setPickup] = useState('');
    const [qr, setQr] = useState('');
    const [remaining, setRemaining] = useState(120);
    const [cameraReady, setCameraReady] = useState(false);
    const [cameraAttempt, setCameraAttempt] = useState(0);
    const [cameraRequested, setCameraRequested] = useState(false);
    useEffect(() => { document.documentElement.scrollTop = 0; document.body.scrollTop = 0; }, [step]);
    const video = useRef<HTMLVideoElement>(null);
    const stream = useRef<MediaStream | null>(null);
    const epoch = useRef(0);
    const busyRef = useRef(false);
    const lastAction = useRef(Date.now());
    const mounted = useRef(true);
    const configRequest = useRef(0);
    const captureTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const stopCamera = () => { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; setCameraReady(false); if (captureTimer.current) {
        clearInterval(captureTimer.current);
        captureTimer.current = null;
    } setCount(0); };
    const applySession = (s: Session) => { setSession(s); if (s.pickupUrl) {
        setPickup(s.pickupUrl);
        setStep('pickup');
    }
    else if (s.status === 'ready' || s.status === 'partial') {
        setSelected(s.images.map(i => i.id));
        setStep('results');
    }
    else if (['generating', 'failed', 'unknown'].includes(s.status)) {
        setStep('generating');
    }
    else {
        setStep('camera');
    } };
    useEffect(() => {
        if (!['home', 'styles'].includes(step)) return;
        const request = ++configRequest.current;
        const current = () => mounted.current && request === configRequest.current;
        setStylesLoading(true); setError('');
        if (step === 'styles') setStyles([]);
        Promise.all([api<Health>('/api/health'), api<Style[]>('/api/styles')]).then(([h, s]) => {
            if (current()) { setHealth(h); setStyles(s); }
        }).catch(e => { if (current()) setError(e.message); }).finally(() => { if (current()) setStylesLoading(false); });
    }, [step, configAttempt]);
    useEffect(() => { mounted.current = true; const version = epoch.current; const id = localStorage.getItem('snap-session'); if (id)
        Promise.all([api<Session>(`/api/sessions/${id}`), api<Health>('/api/health')]).then(([s, h]) => { if (version !== epoch.current || !mounted.current)
            return; if (s.mode === h.mode && s.status !== 'ended' && s.expiresAt > Date.now())
            applySession(s);
        else
            localStorage.removeItem('snap-session'); }).catch(() => { if (version === epoch.current)
            localStorage.removeItem('snap-session'); }); return () => { mounted.current = false; stream.current?.getTracks().forEach(t => t.stop()); if (captureTimer.current)
        clearInterval(captureTimer.current); }; }, []);
    useEffect(() => { if (session)
        localStorage.setItem('snap-session', session.id); }, [session]);
    useEffect(() => { if (step !== 'camera' || !health || (health.mode === 'demo' && !cameraRequested)) {
        stopCamera();
        return;
    } let active = true; setCameraError(''); setCameraReady(false); if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('无法访问摄像头。请在这台电脑使用 localhost 打开，或选择上传照片。');
        return;
    } navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false }).then(s => { if (!active) {
        s.getTracks().forEach(t => t.stop());
        return;
    } stream.current = s;
    s.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
        if (active) { stopCamera(); setCameraError('摄像头已断开，请检查连接后重新连接摄像头。'); }
    }, { once: true }));
    if (video.current) {
        video.current.srcObject = s;
        video.current.play().catch(() => {
            if (active) { stopCamera(); setCameraError('画面未能播放，请点击重新连接摄像头。'); }
        });
    } }).catch((e: DOMException) => { if (active) {
        const messages: Record<string, string> = {
            NotAllowedError: '请点击浏览器地址栏的摄像头权限，允许此页面使用摄像头，再重新连接。',
            NotFoundError: '没有找到摄像头，请接入摄像头后重新连接。',
            NotReadableError: '摄像头被占用或无法读取，请关闭会议、相机等软件后重新连接。',
        };
        setCameraError(messages[e.name] || '摄像头未能开启，请检查设备连接和浏览器权限后重试。');
    } }); return () => { active = false; stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; if (captureTimer.current)
        clearInterval(captureTimer.current); }; }, [step, cameraAttempt, cameraRequested, health?.mode]);
    useEffect(() => { if (session?.status !== 'generating')
        return; const id = session.id; const version = epoch.current; let active = true; const poll = async () => { try {
        const s = await api<Session>(`/api/sessions/${id}`);
        if (!active || version !== epoch.current)
            return;
        setSession(s);
        if (s.status !== 'generating')
            applySession(s);
    }
    catch (e) {
        if (active && version === epoch.current)
            setError((e as Error).message);
    } }; const interval = setInterval(poll, 1800); return () => { active = false; clearInterval(interval); }; }, [session?.id, session?.status]);
    useEffect(() => { let active = true; const version = epoch.current; setQr(''); if (pickup)
        QRCode.toDataURL(pickup, { width: 280, margin: 2, color: { dark: '#33281f', light: '#fffaf0' } }).then(value => { if (active && version === epoch.current)
            setQr(value); }).catch(() => { if (active && version === epoch.current)
            setError('二维码生成失败，请使用下方取图链接'); }); return () => { active = false; }; }, [pickup]);
    const finish = async (destination: 'home' | 'styles' = 'home') => { const version = ++epoch.current; busyRef.current = false; stopCamera(); const previous = session; setSession(undefined); setStep(destination); setPhoto(''); setOrder(undefined); setPickup(''); setQr(''); setSelected([]); setConsent(false); setError(''); setBusy(false); localStorage.removeItem('snap-session'); lastAction.current = Date.now(); setRemaining(120); if (previous)
        try {
            await api(`/api/sessions/${previous.id}/end`, {});
        }
        catch {
            if (version === epoch.current)
                setError('已清除屏幕内容；后台会话未能结束，请检查网络。');
        } };
    useEffect(() => { const limit = step === 'generating' ? 300 : 120; lastAction.current = Date.now(); setRemaining(limit); if (step === 'home')
        return; const touch = () => { lastAction.current = Date.now(); }; window.addEventListener('pointerdown', touch); window.addEventListener('keydown', touch); const timer = setInterval(() => { const seconds = Math.max(0, limit - Math.floor((Date.now() - lastAction.current) / 1000)); setRemaining(seconds); if (seconds === 0)
        void finish(); }, 1000); return () => { clearInterval(timer); window.removeEventListener('pointerdown', touch); window.removeEventListener('keydown', touch); }; }, [step, session?.id]);
    const run = async (action: () => Promise<void>) => { if (busyRef.current)
        return; busyRef.current = true; const version = epoch.current; setBusy(true); setError(''); try {
        await action();
    }
    catch (e) {
        if (mounted.current && version === epoch.current)
            setError((e as Error).message);
    }
    finally {
        if (mounted.current && version === epoch.current) {
            busyRef.current = false;
            setBusy(false);
        }
    } };
    const choose = (style: Style) => { if (busyRef.current)
        return; epoch.current++; return run(async () => { const version = epoch.current; const s = await api<Session>('/api/sessions', { styleId: style.id }); if (version !== epoch.current)
        return; setSession(s); setPhoto(''); setConsent(false); setCameraRequested(false); setStep('camera'); }); };
    const samplePhoto = () => run(async () => {
        if (health?.mode !== 'demo') return;
        const version = epoch.current;
        const response = await fetch('/examples/cartoon-editorial.png');
        if (!response.ok) throw new Error('示例照片暂时无法读取，请重试。');
        const value = await readFile(await response.blob());
        if (version !== epoch.current) return;
        setPhoto(value); setConsent(false); setStep('confirm');
    });
    const takePhoto = () => { if (count || captureTimer.current || !cameraReady || busyRef.current)
        return; setCount(3); let left = 3; captureTimer.current = setInterval(() => { left--; setCount(left); if (left === 0) {
        if (captureTimer.current)
            clearInterval(captureTimer.current);
        captureTimer.current = null;
        const v = video.current;
        if (!v || !v.videoWidth) {
            setCameraError('摄像头画面尚未准备好，请重新拍摄。');
            return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(v, 0, 0);
        setPhoto(canvas.toDataURL('image/jpeg', .92));
        setStep('confirm');
    } }, 1000); };
    const generate = () => run(async () => { if (!session || !consent)
        return; const version = epoch.current; const s = await api<Session>(`/api/sessions/${session.id}/photo`, { dataUrl: photo }); if (version !== epoch.current)
        return; setSession(s); const next = await api<Session>(`/api/sessions/${s.id}/generate`, {}); if (version === epoch.current)
        applySession(next); });
    const retry = () => run(async () => { if (!session)
        return; const version = epoch.current; const next = await api<Session>(`/api/sessions/${session.id}/generate`, {}); if (version === epoch.current)
        applySession(next); });
    const checkout = () => run(async () => { if (!session || !selected.length)
        return; const version = epoch.current; const o = await api<Order>(`/api/sessions/${session.id}/orders`, { imageIds: selected }); if (version === epoch.current) {
        setOrder(o);
        setStep('payment');
    } });
    const pay = (outcome: 'paid' | 'failed' | 'cancelled') => run(async () => { if (!order)
        return; const version = epoch.current; const result = await api<{
        order: Order;
        pickupUrl?: string;
    }>(`/api/orders/${order.id}/simulate`, { outcome }); if (version !== epoch.current)
        return; setOrder(result.order); if (result.pickupUrl) {
        setPickup(result.pickupUrl);
        setStep('pickup');
    }
    else if (outcome === 'cancelled') {
        setStep('results');
    }
    else {
        setError('模拟支付失败。没有扣款，请重新选择购买。');
        setStep('results');
    } });
    const total = selected.length === 1 ? 990 : 1990;
    const style = styles.find(s => s.id === session?.styleId);
    const index = step === 'home' ? 0 : ['camera', 'confirm'].includes(step) ? 1 : step === 'generating' ? 2 : 3;
    return <div className={`shell kiosk-shell ${step === 'home' ? 'is-idle' : ''}`}><header><Brand /><div className="header-right">{step === 'home' && <DisplayControls />}<span className="mode"><i />{!health ? '连接设备中' : health.mode === 'seedream' ? 'Seedream 云端' : '演示模式 · 非 AI 生图'}</span></div></header>
 <main>{step === 'home' ? <AttractScreen onStart={() => { epoch.current++; setStep('styles'); }} /> : step === 'styles' ? <ThemePicker styles={styles} loading={stylesLoading} busy={busy} error={error} onBack={() => void finish()} onChoose={choose} /> : <><nav className="progress" aria-label="拍照进度">{['主题', '拍照', '生成', '取图'].map((text, i) => <span className={i <= index ? 'active' : ''} key={text}><b>0{i + 1}</b>{text}</span>)}<button className="text-button" onClick={() => void finish()}>结束本次 ↗</button></nav>
 {['camera', 'confirm'].includes(step) && <section className="capture-layout"><div className="camera-frame">{step === 'camera' && health?.mode === 'demo' && !cameraRequested ? <div className="sample-preview"><img src="/examples/cartoon-editorial.png" alt="演示用示例照片" /><span>示例照片</span></div> : step === 'camera' ? <><video ref={video} muted playsInline autoPlay className="mirror" onPlaying={e => { const v = e.currentTarget; if (stream.current?.active && v.videoWidth > 0 && v.videoHeight > 0) { setCameraReady(true); setCameraError(''); } }} onWaiting={() => setCameraReady(false)}/><div className="viewfinder"/>{!cameraReady && <div className="camera-placeholder"><span>◎</span><p>{cameraError ? '摄像头需要你帮个忙' : '正在打开摄像头…'}</p></div>}{count > 0 && <div className="countdown" role="status" aria-live="assertive">{count}</div>}</> : <img src={photo} alt="刚刚拍摄或上传的照片"/>}</div><div className="capture-copy"><div className="capture-theme"><span className="selected-theme">{style?.name || session?.styleName}</span>{step === 'camera' && <button className="secondary" onClick={() => void finish('styles')}>更换主题</button>}</div><h1>{step === 'camera' ? (health?.mode === 'demo' && !cameraRequested ? <>准备一张照片</> : <>看向镜头</>) : <>确认照片</>}</h1><p>{step === 'camera' ? (health?.mode === 'demo' && !cameraRequested ? '用示例照片体验，也可以开启摄像头。' : '露出完整面部，保持自然。') : '满意就继续，也可以重新选择。'}</p>{step === 'camera' ? <>{(health?.mode !== 'demo' || cameraRequested) && <button className="primary capture-button" disabled={!cameraReady || count > 0 || busy} onClick={takePhoto}>◎ {count ? '看镜头，保持微笑' : '拍照'}</button>}{health?.mode === 'demo' && <><button className={cameraRequested ? 'secondary' : 'primary'} disabled={busy || count > 0} onClick={samplePhoto}>{busy ? '正在读取…' : '使用示例照片'}</button>{!cameraRequested && <button className="secondary" disabled={busy} onClick={() => setCameraRequested(true)}>使用摄像头</button>}</>}{cameraError && <><p role="alert" className="error">{cameraError}</p><button className="secondary" onClick={() => setCameraAttempt(n => n + 1)}>重新连接摄像头</button></>}<details className="photo-options"><summary>使用其他照片</summary><label className="upload-link">上传照片<input type="file" accept="image/jpeg,image/png" disabled={count > 0 || busy} onChange={e => { const file = e.target.files?.[0]; const version = epoch.current; if (file)
            void run(async () => { const value = await readFile(file); if (version !== epoch.current)
                return; setPhoto(value); setStep('confirm'); }); e.target.value = ''; }}/></label></details><small className="muted">照片仅用于本次体验，默认保存 24 小时。</small></> : <><label className="consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>{health?.mode === 'seedream' ? '我同意将这张照片上传至 Seedream 云端进行 AI 生成，图片默认保存 24 小时。' : '同意本机处理这张照片，保存 24 小时。演示不调用 AI。'}</span></label><button className="primary" disabled={!health || !consent || busy || (health?.mode === 'seedream' && !health.configured)} onClick={generate}>{busy ? '正在提交…' : '确认并生成'}</button>{health?.mode === 'seedream' && !health.configured && <p className="error">Seedream 尚未配置，请先在后台完成配置。</p>}<button className="secondary" disabled={busy} onClick={() => { setPhoto(''); setConsent(false); setStep('camera'); }}>重新拍一张</button></>}</div></section>}
 {step === 'generating' && <section className="waiting"><div className={`waiting-symbol ${session?.status === 'generating' ? 'spinning' : ''}`}>✳</div><h1>{session?.status === 'generating' ? <>照片生成中</> : <>生成未完成</>}</h1><p role="status">{session?.status === 'generating' ? (session.mode === 'demo' ? '正在制作演示图片效果，不调用 AI…' : '正在由 Seedream 生成，请稍等。暂时离开页面后可刷新恢复。') : session?.error || '生成未完成，请查看错误信息。'}</p>{session?.status === 'generating' && session.mode !== 'demo' && <p className="fine-print">5 分钟无操作会回到首页。结束体验不会取消已提交的云端请求，结果可能仍会完成。</p>}{session?.status === 'failed' && <button className="primary" onClick={retry} disabled={busy}>{busy ? '正在重试…' : '重新生成'}{session.mode === 'seedream' ? '（会再次调用 API）' : ''}</button>}{session?.status === 'unknown' && <p className="error">结果暂时无法确认。为避免重复计费，不提供自动重试，请到工作台检查记录。</p>}<button className="text-button" onClick={() => void finish()}>结束本次，回到首页 →</button></section>}
 {step === 'results' && <section className="results"><div className="results-heading"><div><h1>选择照片</h1><p>{session?.mode === 'demo' ? '演示效果图 · 本机图片处理，非 AI 生成' : 'Seedream 生成结果'}{session?.elapsedMs ? ` · 用时 ${(session.elapsedMs / 1000).toFixed(1)} 秒` : ''}</p>{session?.status === 'partial' && <p className="error">本次部分生成成功，只按实际可用图片购买。</p>}</div></div><div className="results-grid">{session?.images.map((img, i) => <button key={img.id} className={`photo-print ${selected.includes(img.id) ? 'selected' : ''}`} aria-pressed={selected.includes(img.id)} onClick={() => setSelected(old => old.includes(img.id) ? old.filter(id => id !== img.id) : [...old, img.id])}><img src={img.previewUrl} alt={`带水印预览图 ${i + 1}`}/><span><b>照片 {i + 1}</b><span>{selected.includes(img.id) ? '● 已选' : '○ 选择这张'}</span></span></button>)}</div><div className="checkout-bar"><div><strong>选择要保留的照片</strong><p>预览含水印 · 解锁高清原图</p></div><button className="text-button" onClick={() => setSelected(session?.images.map(i => i.id) || [])}>全选</button><button className="primary" onClick={checkout} disabled={!selected.length || busy}>{busy ? '正在准备…' : `模拟购买 ${selected.length} 张 · ${selected.length ? money(total) : '请选择'}`}</button></div><p className="fine-print">模拟支付，不实际扣款。</p></section>}
 {step === 'payment' && <section className="payment"><h1>确认购买</h1><div className="purchase-ticket"><span>高清无水印照片 × {order?.imageIds.length}</span><strong>{money(order?.amount || 0)}</strong><div className="ticket-line"/><b>模拟支付，不实际扣款</b><button className="primary" disabled={busy} onClick={() => pay('paid')}>{busy ? '处理中…' : '模拟支付成功 →'}</button><button className="secondary cancel-purchase" disabled={busy} onClick={() => pay('cancelled')}>返回选图</button><details className="simulation-options"><summary>异常演示</summary><button className="text-button" disabled={busy} onClick={() => pay('failed')}>模拟支付失败</button></details></div></section>}
 {step === 'pickup' && <section className="delivery"><div><h1>扫码取图</h1><p>用手机扫码，把高清照片带回去。</p><p className="muted">手机需和电脑连接同一 Wi-Fi。<br />图片默认保存 24 小时，请及时下载。</p><button className="primary" onClick={() => void finish()}>完成，返回首页</button><p className="fine-print">本次为模拟购买，无实际扣款。</p></div><div className="qr-ticket">{qr ? <img src={qr} alt="手机取图二维码"/> : <p>正在生成二维码…</p>}<a href={pickup} target="_blank" rel="noreferrer">在当前设备打开相册 ↗</a><small>请保留链接，不要分享给陌生人</small></div></section>}
 </>}{error && <div role="alert" className="error global-error">{error}{['home', 'styles'].includes(step) && <button className="secondary" disabled={stylesLoading} onClick={() => setConfigAttempt(value => value + 1)}>重新连接</button>}<button className="text-button" onClick={() => setError('')} aria-label="关闭错误提示">×</button></div>}{remaining <= 20 && step !== 'home' && <div className="timeout" role="alert">{remaining} 秒后结束本次体验<button onClick={() => { lastAction.current = Date.now(); setRemaining(step === 'generating' ? 300 : 120); }}>我还在，继续</button></div>}</main><footer><span>{health?.mode === 'demo' ? '本地演示 · 不实际扣款' : 'SNAP CLUB'}</span>{step === 'home' && <a href="/admin" aria-label="设备工作台">设备设置</a>}</footer></div>;
}
