import React, { useEffect, useRef, useState } from 'react';
import { recommendedFrame, type Purpose } from '../../../packages/shared/portrait-experience';
import QRCode from 'qrcode';
import { FramePicker } from './PhotoFrame';
import { defaultCaption, type Caption, type FrameId } from '../../../packages/shared/frames';
import { useBoothTransition } from './useBoothTransition';
import { AttractScreen } from './AttractScreen';
import { ThemePicker } from './ThemePicker';
import { GenerationPreview } from './GenerationPreview';
import { DisplayControls } from './DisplayControls';
import type { Health, Session, Style } from '../../../packages/shared/types';
import { api, readFile } from './api';
import { Brand } from './Brand';
import { PhotoResults } from './PhotoResults';
import { orientationLabel, type PhotoOrientation } from '../../../packages/shared/photo-orientation';
import { PhotoLibrary, timeLeft, usePhotoClock } from './PhotoLibrary';
import { ClothingPicker } from './ClothingPicker';
import { type ClothingMode } from '../../../packages/shared/clothing';
import { cameraConstraints, cameraFailure } from './camera-settings';
export { Pickup } from './Pickup';
type Draft = { photo: string; consent: boolean; orientation: PhotoOrientation; clothingMode: ClothingMode };
type SavedRound = { ids: string[]; activeAt: number; idleMs: number };
const readRound = (): SavedRound | undefined => {
    try {
        const value = JSON.parse(localStorage.getItem('snap-round') || 'null');
        if (value && Array.isArray(value.ids) && value.ids.every((id: unknown) => typeof id === 'string') && Number.isFinite(value.activeAt)) return value;
    } catch { }
};
export function Booth() {
    const [frame, setFrame] = useState<FrameId>('none');
    const [caption, setCaption] = useState<Caption>(defaultCaption);
    const [orientation, setOrientation] = useState<PhotoOrientation>('portrait');
    const [clothingMode, setClothingMode] = useState<ClothingMode>('keep');
    const [frameSaving, setFrameSaving] = useState(false);
    const [frameError, setFrameError] = useState('');
    const frameQueue = useRef<Promise<void>>(Promise.resolve());
    const frameRequest = useRef(0);
    const [health, setHealth] = useState<Health>();
    const [styles, setStyles] = useState<Style[]>([]);
    const [stylesLoading, setStylesLoading] = useState(false);
    const [configAttempt, setConfigAttempt] = useState(0);
    const [session, setSession] = useState<Session>();
    const [library, setLibrary] = useState<Session[]>([]);
    const libraryRef = useRef<Session[]>([]);
    const drafts = useRef(new Map<string, Draft>());
    const roundEpoch = useRef(0);
    const libraryFrom = useRef('styles');
    const now = Math.max(usePhotoClock(), Date.now());
    const { step, setStep, main: motionMain } = useBoothTransition();
    const currentStep = useRef(step); currentStep.current = step;
    const currentSession = useRef(session); currentSession.current = session;
    const [photo, setPhoto] = useState('');
    const [error, setError] = useState('');
    const [cameraError, setCameraError] = useState('');
    const [busy, setBusy] = useState(false);
    const [count, setCount] = useState(0);
    const [consent, setConsent] = useState(false);
    const [selected, setSelected] = useState<string[]>([]);
    const [pickup, setPickup] = useState('');
    const [qr, setQr] = useState('');
    const [remaining, setRemaining] = useState(120);
    const [cameraReady, setCameraReady] = useState(false);
    const [cameraAttempt, setCameraAttempt] = useState(0);
    useEffect(() => { document.documentElement.scrollTop = 0; document.body.scrollTop = 0; }, [step]);
    const video = useRef<HTMLVideoElement>(null);
    const stream = useRef<MediaStream | null>(null);
    const epoch = useRef(0);
    const busyRef = useRef(false);
    const lastAction = useRef(Date.now());
    const mounted = useRef(true);
    const configRequest = useRef(0);
    const captureTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const saveRound = () => {
        const ids = libraryRef.current.map(s => s.id);
        if (ids.length) localStorage.setItem('snap-round', JSON.stringify({ ids, activeAt: lastAction.current, idleMs: libraryRef.current.some(s => s.status === 'generating') ? 300000 : 120000 }));
        else localStorage.removeItem('snap-round');
    };
    const updateLibrary = (items: Session[]) => { libraryRef.current = items; setLibrary(items); saveRound(); };
    const remember = (s: Session) => { if (s.expiresAt <= Date.now() || s.status === 'ended') return;
        updateLibrary([s, ...libraryRef.current.filter(item => item.id !== s.id)].sort((a, b) => b.createdAt - a.createdAt));
    };
    const stopCamera = () => { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; setCameraReady(false); if (captureTimer.current) {
        clearInterval(captureTimer.current);
        captureTimer.current = null;
    } setCount(0); };
    const applySession = (s: Session) => { setSession(s); setPickup(s.pickupUrl || ''); setOrientation(drafts.current.get(s.id)?.orientation ?? s.orientation ?? 'portrait'); setClothingMode(drafts.current.get(s.id)?.clothingMode ?? s.clothingMode ?? 'keep');
    // A prepaid pickup URL may exist before an image does. Restore the work, not its QR.
    if (s.status === 'ready' || s.status === 'partial') {
        setSelected(s.images.slice(0, 1).map(i => i.id));
        setStep('results');
    }
    else if (['generating', 'failed', 'unknown'].includes(s.status)) {
        setStep('generating');
    }
    else {
        setStep(drafts.current.get(s.id)?.photo || s.originalUrl ? 'confirm' : 'camera');
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
    useEffect(() => {
        mounted.current = true;
        const version = epoch.current, saved = readRound(), id = localStorage.getItem('snap-session');
        const ids = [...new Set(saved?.ids ?? (id ? [id] : []))];
        if (saved && Date.now() - saved.activeAt >= Math.min(saved.idleMs || 120000, 300000)) {
            localStorage.removeItem('snap-session'); localStorage.removeItem('snap-round');
            for (const oldId of ids) void api(`/api/sessions/${oldId}/end`, {}).catch(() => {});
        } else if (ids.length) {
            Promise.all([Promise.all(ids.map(savedId => api<Session>(`/api/sessions/${savedId}`).catch(() => undefined))), api<Health>('/api/health')]).then(([items, h]) => {
                if (version !== epoch.current || !mounted.current) return;
                setHealth(h);
                const valid = items.filter((s): s is Session => !!s && s.mode === h.generation && s.status !== 'ended' && s.expiresAt > Date.now());
                updateLibrary(valid);
                const s = valid.find(item => item.id === id);
                if (s) { setFrame(s.frame ?? 'none'); setCaption(s.caption ?? defaultCaption); applySession(s); }
                else { localStorage.removeItem('snap-session'); if (valid.length) setStep('library'); }
            }).catch(() => { if (version === epoch.current) { localStorage.removeItem('snap-session'); localStorage.removeItem('snap-round'); } });
        }
        return () => { mounted.current = false; stream.current?.getTracks().forEach(t => t.stop()); if (captureTimer.current) clearInterval(captureTimer.current); };
    }, []);
    useEffect(() => { if (session) { localStorage.setItem('snap-session', session.id); remember(session); } }, [session]);
    useEffect(() => { if (session && photo) drafts.current.set(session.id, { photo, consent, orientation, clothingMode }); }, [session?.id, photo, consent, orientation, clothingMode]);
    useEffect(() => { if (step !== 'camera' || !health) {
        stopCamera();
        return;
    } let active = true; setCameraError(''); setCameraReady(false); if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('无法访问摄像头。请在这台电脑使用 localhost 打开，或选择上传照片。');
        return;
    } navigator.mediaDevices.getUserMedia(cameraConstraints()).then(s => { if (!active) {
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
        setCameraError(cameraFailure(e.name));
    } }); return () => { active = false; stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; if (captureTimer.current)
        clearInterval(captureTimer.current); }; }, [step, cameraAttempt, health?.mode]);
    const generatingIds = library.filter(s => s.status === 'generating').map(s => s.id).sort().join(',');
    useEffect(() => {
        if (!generatingIds) return;
        const version = roundEpoch.current; let active = true, polling = false;
        const poll = async () => {
            if (polling) return; polling = true;
            await Promise.all(generatingIds.split(',').map(async id => {
                try {
                    const s = await api<Session>(`/api/sessions/${id}`);
                    if (!active || version !== roundEpoch.current || !libraryRef.current.some(item => item.id === id)) return;
                    // A local decoration edit may still be queued while the job finishes.
                    const previous = libraryRef.current.find(item => item.id === id);
                    const refreshed = { ...s, frame: previous?.frame ?? s.frame, caption: previous?.caption ?? s.caption };
                    remember(refreshed);
                    if (currentSession.current?.id === id) {
                        setSession(refreshed);
                        if (s.images.length) setSelected(previousIds => previousIds.length ? previousIds : s.images.slice(0, 1).map(i => i.id));
                        if (s.status !== 'generating' && currentStep.current === 'generating') applySession(refreshed);
                    }
                } catch (e) { if (active && version === roundEpoch.current) setError((e as Error).message); }
            }));
            polling = false;
        };
        const interval = setInterval(poll, 1800);
        return () => { active = false; clearInterval(interval); };
    }, [generatingIds]);
    useEffect(() => { let active = true; const version = epoch.current; setQr(''); if (pickup)
        QRCode.toDataURL(pickup, { width: 280, margin: 2, color: { dark: '#33281f', light: '#fffaf0' } }).then(value => { if (active && version === epoch.current)
            setQr(value); }).catch(() => { if (active && version === epoch.current)
            setError('二维码生成失败，请使用下方取图链接'); }); return () => { active = false; }; }, [pickup]);
    const clearCurrent = () => {
        epoch.current++; busyRef.current = false; stopCamera(); frameRequest.current++; frameQueue.current = Promise.resolve();
        setFrame('none'); setCaption(defaultCaption); setOrientation('portrait'); setClothingMode('keep'); setFrameSaving(false); setFrameError('');
        setSession(undefined); setPhoto(''); setPickup(''); setQr(''); setSelected([]); setConsent(false); setError(''); setBusy(false);
        localStorage.removeItem('snap-session');
    };
    const finish = async () => {
        const previous = [...new Set([...libraryRef.current.map(s => s.id), ...(session ? [session.id] : [])])];
        roundEpoch.current++; clearCurrent(); const version = epoch.current;
        drafts.current.clear(); updateLibrary([]); setStep('home'); lastAction.current = Date.now(); setRemaining(120);
        const results = await Promise.allSettled(previous.map(id => api(`/api/sessions/${id}/end`, {}).catch(e => { if (e.status !== 410) throw e; })));
        if (version === epoch.current && results.some(r => r.status === 'rejected')) setError('已清除屏幕内容；后台会话未能结束，请检查网络。');
    };
    useEffect(() => { const limit = generatingIds ? 300 : 120; lastAction.current = Date.now(); setRemaining(limit); saveRound(); if (step === 'home' && !libraryRef.current.length)
        return; const touch = () => { lastAction.current = Date.now(); saveRound(); }; window.addEventListener('pointerdown', touch); window.addEventListener('keydown', touch); const timer = setInterval(() => { const seconds = Math.max(0, limit - Math.floor((Date.now() - lastAction.current) / 1000)); setRemaining(seconds); if (seconds === 0)
        void finish(); }, 1000); return () => { clearInterval(timer); window.removeEventListener('pointerdown', touch); window.removeEventListener('keydown', touch); }; }, [step, session?.id, !!generatingIds]);
    useEffect(() => {
        const expired = libraryRef.current.filter(s => s.expiresAt <= now);
        if (!expired.length) return;
        expired.forEach(s => drafts.current.delete(s.id));
        updateLibrary(libraryRef.current.filter(s => s.expiresAt > now));
        if (session && expired.some(s => s.id === session.id)) {
            clearCurrent(); setStep('library', true); libraryFrom.current = 'styles'; setError('照片已到期并自动删除。可以再拍一张。');
        }
    }, [now]);
    const openLibrary = () => { if (busyRef.current || frameSaving || frameError) return; stopCamera(); libraryFrom.current = step; setStep('library'); };
    const back = () => {
        if (busyRef.current || frameSaving || frameError) return;
        setError('');
        if (step === 'camera') setStep('styles');
        else if (step === 'confirm') setStep(['created', 'photographed'].includes(session?.status || '') ? 'camera' : 'library');
        else if (step === 'generating') setStep('confirm');
        else if (step === 'results') { libraryFrom.current = 'results'; setStep('library'); }
        else if (step === 'pickup') setStep(session?.images.length ? 'results' : 'generating');
    };
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
    const choose = (style: Style, selectedPurpose: Purpose = 'self') => { if (busyRef.current)
        return; epoch.current++; return run(async () => { const version = epoch.current; const s = await api<Session>('/api/sessions', { styleId: style.id, purpose: selectedPurpose }); if (version !== epoch.current)
        return; setFrame(s.frame ?? 'none'); setCaption(s.caption ?? defaultCaption); setOrientation(s.orientation ?? 'portrait'); setClothingMode(s.clothingMode ?? 'keep'); setSession(s); setPhoto(''); setConsent(false); setSelected([]); setPickup(''); setQr(''); setStep('camera'); }); };
    const openPhoto = (item: Session) => run(async () => {
        const version = epoch.current;
        const s = await api<Session>(`/api/sessions/${item.id}`);
        if (version !== epoch.current) return;
        const draft = drafts.current.get(s.id);
        setFrame(s.frame ?? 'none'); setCaption(s.caption ?? defaultCaption); setOrientation(draft?.orientation ?? s.orientation ?? 'portrait');
        setPhoto(draft?.photo || ''); setConsent(draft?.consent ?? false); setFrameError(''); setPickup(s.pickupUrl || ''); setSelected(s.images.slice(0, 1).map(i => i.id));
        applySession(s);
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
    const useDemoPhoto = () => run(async () => {
        if (!health?.testMode || !session) return;
        const version = epoch.current;
        const response = await fetch('/examples/film-reference.png');
        if (!response.ok) throw new Error('测试照片未能读取，请检查素材文件。');
        const value = await readFile(await response.blob());
        if (version !== epoch.current) return;
        setPhoto(value); setConsent(false); setStep('confirm');
    });
    const startGeneration = async (s: Session, version: number) => {
        const next = await api<Session>(`/api/sessions/${s.id}/generate`, { clothingMode: s.clothingMode ?? clothingMode });
        if (version === epoch.current) applySession(next);
    };
    const generate = () => run(async () => {
        if (!session || !consent || !['created', 'photographed'].includes(session.status)) return;
        const version = epoch.current;
        const s = photo ? await api<Session>(`/api/sessions/${session.id}/photo`, { dataUrl: photo, orientation, clothingMode }) : session;
        if (version !== epoch.current) return;
        setSession(s);
        await startGeneration({ ...s, clothingMode }, version);
    });
    const retry = () => run(async () => { if (!session)
        return; const version = epoch.current; const next = await api<Session>(`/api/sessions/${session.id}/generate`, {}); if (version === epoch.current)
        applySession(next); });
    const changeFrame = (next: FrameId, nextCaption: Caption = caption) => {
        if (!session) return;
        const id = session.id, version = epoch.current, request = ++frameRequest.current;
        setFrame(next); setCaption(nextCaption); setFrameSaving(true); setFrameError('');
        setSession({ ...session, frame: next, caption: nextCaption });
        // Serial saves prevent fast taps from reaching the server out of order.
        frameQueue.current = frameQueue.current.then(async () => {
            if (version !== epoch.current) return;
            try {
                await api('/api/sessions/' + id + '/frame', { frame: next, caption: nextCaption });
                if (mounted.current && version === epoch.current && request === frameRequest.current) setFrameSaving(false);
            } catch {
                if (mounted.current && version === epoch.current && request === frameRequest.current) {
                    setFrameSaving(false); setFrameError('边框尚未保存，请重试。');
                }
            }
        });
    };
    const openPickup = () => {
        if (!session?.pickupUrl || busyRef.current || frameSaving || frameError) return;
        setPickup(session.pickupUrl); setStep('pickup');
    };
    const style = styles.find(s => s.id === session?.styleId);
    const lockedPhoto = !!session && !['created', 'photographed'].includes(session.status);
    const index = ['home', 'styles'].includes(step) ? 0 : ['camera', 'confirm'].includes(step) ? 1 : step === 'generating' ? 2 : 3;
    return <div data-step={step} className={`shell kiosk-shell ${step === 'home' ? 'is-idle' : ''}`}><header><Brand /><div className="header-right">{step === 'home' && <DisplayControls />}<div className="visit-actions">{(step !== 'home' || library.length > 0) && <button className="text-button" disabled={busy || frameSaving || !!frameError || step === 'library'} onClick={openLibrary}>本轮照片库</button>}{(library.length > 0 || step === 'library') && <button className="text-button" onClick={() => void finish()}>结束本次 ↗</button>}</div>{health?.testMode && <span className="mode"><i />测试模式</span>}</div></header>
 <main ref={motionMain}>{step === 'home' ? <AttractScreen styles={styles} onStart={() => { epoch.current++; setStep('styles'); }} /> : step === 'styles' ? <ThemePicker styles={styles} loading={stylesLoading} busy={busy} error={error} onBack={() => { epoch.current++; setStep('home'); }} onChoose={choose} /> : step === 'library' ? <PhotoLibrary sessions={library} draftPhoto={id => drafts.current.get(id)?.photo || ''} now={now} busy={busy} onOpen={openPhoto} onNew={() => setStep('styles')} onBack={() => setStep(session && !['home', 'styles', 'library'].includes(libraryFrom.current) ? libraryFrom.current : 'styles')} /> : <><div className="step-bar"><button className="secondary step-back" disabled={busy || frameSaving || !!frameError} onClick={back}>← {step === 'results' ? '返回照片库' : step === 'pickup' ? (session?.images.length ? '返回照片' : '返回生成状态') : '返回上一步'}</button><nav className="progress" aria-label="拍照进度">{['主题', '拍照', '生成', '取图'].map((text, i) => <span className={i === index ? 'active current' : i < index ? 'active complete' : ''} aria-current={i === index ? 'step' : undefined} key={text}><b>{i < index ? '✓' : `0${i + 1}`}</b>{text}</span>)}</nav>{session && <span className="photo-expiry">{session.images.length ? '剩余保存' : '本次有效'} <b>{timeLeft(session.expiresAt, now)}</b> · 到期自动删除</span>}</div>
 {['camera', 'confirm'].includes(step) && <section className="capture-layout"><div className="camera-frame">{step === 'camera' ? <><video ref={video} muted playsInline autoPlay className="mirror" onPlaying={e => { const v = e.currentTarget; if (stream.current?.active && v.videoWidth > 0 && v.videoHeight > 0) { setCameraReady(true); setCameraError(''); } }} onWaiting={() => setCameraReady(false)}/><div className="viewfinder"/>{cameraReady && !count && <div className="distance-hint" role="note">尽量靠近一些，展示完整的面部和上半身</div>}{!cameraReady && <div className="camera-placeholder"><span>◎</span><p>{health?.testMode ? '上传照片或使用测试照片' : cameraError ? '摄像头需要你帮个忙' : '正在打开摄像头…'}</p></div>}{count > 0 && <div className="countdown" role="status" aria-live="assertive">{count}</div>}</> : <img src={photo || session?.originalUrl} alt="刚刚拍摄或上传的照片"/>}</div><div className="capture-copy"><div className="capture-theme"><span className="selected-theme">{style?.name || session?.styleName}</span>{step === 'camera' && <button className="secondary" disabled={busy} onClick={() => setStep('styles')}>更换主题</button>}</div><h1>{step === 'camera' ? <>看向镜头</> : <>确认照片</>}</h1>{step === 'camera' ? <><p className="distance-tip" role="note">尽量靠近一些，展示完整的面部和上半身</p><button className="primary capture-button" disabled={!cameraReady || count > 0 || busy} onClick={takePhoto}>◎ {count ? '看镜头，保持微笑' : '拍照'}</button>{cameraError && <><p role="alert" className="error">{cameraError}</p><button className="secondary" onClick={() => setCameraAttempt(n => n + 1)}>重新连接摄像头</button></>}{photo && <button className="secondary" disabled={busy || count > 0} onClick={() => setStep('confirm')}>使用刚才的照片</button>}<details className="photo-options"><summary>使用其他照片</summary><label className="upload-link">上传照片<input type="file" accept="image/jpeg,image/png" disabled={count > 0 || busy} onChange={e => { const file = e.target.files?.[0]; const version = epoch.current; if (file)
            void run(async () => { const value = await readFile(file); if (version !== epoch.current)
                return; setPhoto(value); setStep('confirm'); }); e.target.value = ''; }}/></label></details>{health?.testMode && <div className="demo-photo-entry"><button className="secondary" disabled={busy || count > 0} onClick={useDemoPhoto}>使用测试照片</button><p className="fine-print">测试样图，仅在测试模式显示。</p></div>}</> : lockedPhoto ? <><p className="locked-photo-note">{session?.status === 'generating' ? '正在生成，返回不会中断。' : '已提交生成，可查看结果。'}</p><button className="primary" onClick={() => setStep(session?.images.length ? 'results' : 'generating')}>{session?.images.length ? '查看生成照片' : '查看生成进度'}</button><button className="secondary" onClick={openLibrary}>查看本轮照片库</button></> : <><p className="capture-guidance">确认脸部清晰、没有遮挡。</p>{style?.generationPreset === 'coming-of-age' || session?.styleId === 'coming-of-age' ? <div className="poster-settings"><strong>成人礼海报 · 2:3</strong><p>深蓝换装 · 含“你好 / 我的18岁”文字</p></div> : style?.generationPreset === 'directed-portrait' ? <><div className="poster-settings"><strong>固定{orientationLabel(orientation)}</strong></div><ClothingPicker value={clothingMode} onChange={setClothingMode} disabled={busy} /></> : <><fieldset className="orientation-picker" disabled={busy || (!photo && !!session?.originalUrl)}><legend>选择照片比例</legend><div className="orientation-options">{([{id:'portrait',name:'竖版',ratio:'3:4',note:'适合单人肖像'},{id:'landscape',name:'横版',ratio:'4:3',note:'适合合照与环境'}] as const).map(item=><button type="button" key={item.id} className={orientation===item.id?'selected':''} aria-pressed={orientation===item.id} onClick={()=>setOrientation(item.id)}><span className={`orientation-shape ${item.id}`} aria-hidden="true"/><span><strong>{item.name}</strong><small>{item.ratio} · {item.note}</small></span><i aria-hidden="true">{orientation===item.id?'✓':''}</i></button>)}</div></fieldset><ClothingPicker value={clothingMode} onChange={setClothingMode} disabled={busy} /></>}<div className="confirm-actions"><label className="consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>{health?.generation === 'seedream' ? '同意上传照片至云端生成。生成后 10 分钟自动删除。' : '同意本机处理照片。生成后 10 分钟自动删除。'}</span></label><button className="primary" disabled={!health || !consent || busy || (health?.generation === 'seedream' && !health.configured)} onClick={generate}>{busy ? '正在提交…' : '开始生成 →'}</button>{health?.generation === 'seedream' && !health.configured && <p className="error">Seedream 尚未配置，请先在后台完成配置。</p>}</div><button className="secondary" disabled={busy} onClick={() => { if (session) drafts.current.delete(session.id); setPhoto(''); setConsent(false); setStep('camera'); }}>重新拍一张</button></>}</div></section>}
 {step === 'generating' && <section className="waiting" data-orientation={session?.orientation ?? orientation}><GenerationPreview photo={photo || session?.originalUrl || ''} active={session?.status === 'generating'} demo={session?.mode === 'demo'} theme={style?.name || session?.styleName} frame={frame} caption={caption} orientation={session?.orientation ?? orientation} /><FramePicker recommended={recommendedFrame(session?.styleId || "", session?.purpose)} value={frame} caption={caption} onCaptionChange={value => changeFrame(frame, value)} onChange={changeFrame} saving={frameSaving} error={frameError} />{session?.status !== 'generating' && <p role="alert">{session?.error || '生成未完成'}</p>}{session?.status === 'generating' && session.mode !== 'demo' && <p className="fine-print">结束体验不会取消云端生成。</p>}{session?.status === 'failed' && <button className="primary" onClick={retry} disabled={busy}>{busy ? '正在重试…' : '重新生成'}{session.mode === 'seedream' ? '（再次使用生成额度）' : ''}</button>}{session?.status === 'unknown' && <p className="error">结果未知，不提供自动重试。请联系工作人员。</p>}{['failed', 'unknown'].includes(session?.status || '') && session?.pickupUrl && <button className="secondary" disabled={busy} onClick={openPickup}>先保存拍摄原片</button>}</section>}
 {step === 'results' && session && <><PhotoResults session={session} photo={photo} selected={selected} frame={frame} caption={caption} busy={busy || frameSaving || !!frameError} onSelect={id => setSelected([id])} onPickup={openPickup}><FramePicker recommended={recommendedFrame(session?.styleId || "", session?.purpose)} value={frame} caption={caption} onCaptionChange={value => changeFrame(frame, value)} onChange={changeFrame} saving={frameSaving} error={frameError} /></PhotoResults><div className="library-toolbar"><button className="secondary" disabled={busy || frameSaving || !!frameError} onClick={() => setStep('styles')}>再拍一张 ↗</button></div></>}
 {step === 'pickup' && <section className="delivery"><div><h1>扫码取图</h1><p className="muted">手机连接同一 Wi-Fi 后扫码</p>{session && <p className="pickup-countdown"><b>{timeLeft(session.expiresAt, now)}</b> 后自动删除</p>}<button className="primary" onClick={() => void finish()}>完成，返回首页</button></div><div className="qr-ticket">{qr ? <img src={qr} alt="手机取图二维码"/> : <p>正在生成二维码…</p>}<a href={pickup} target="_blank" rel="noreferrer">在当前设备打开相册 ↗</a></div></section>}
 </>}{error && <div role="alert" className="error global-error">{error}{['home', 'styles'].includes(step) && <button className="secondary" disabled={stylesLoading} onClick={() => setConfigAttempt(value => value + 1)}>重新连接</button>}<button className="text-button" onClick={() => setError('')} aria-label="关闭错误提示">×</button></div>}{remaining <= 20 && (step !== 'home' || library.length > 0) && <div className="timeout" role="alert">{remaining} 秒后结束本次体验<button onClick={() => { lastAction.current = Date.now(); setRemaining(generatingIds ? 300 : 120); saveRound(); }}>我还在，继续</button></div>}</main><footer><span>SNAP CLUB</span>{step === 'home' && <a href="/admin" aria-label="设备工作台">设备设置</a>}</footer></div>;
}
