import React, { useEffect, useRef, useState } from 'react';
import { recommendedFrame, type Purpose } from '../../../packages/shared/portrait-experience';
import QRCode from 'qrcode';
import { FramePicker, PhotoFrame } from './PhotoFrame';
import { defaultCaption, type Caption, type FrameId } from '../../../packages/shared/frames';
import { useBoothTransition } from './useBoothTransition';
import { AttractScreen } from './AttractScreen';
import { ThemePicker } from './ThemePicker';
import { WaitExperience } from './wait/WaitExperience';
import { fortuneById } from '../../../packages/shared/fortunes';
import { decoratedPrintId } from '../../../packages/shared/printing';
import { StaffEntry } from './StaffEntry';
import { useKioskTouch } from './useKioskTouch';
import { beep, shutter } from './booth-sound';
import { PoseGuide } from './PoseGuide';
import type { Health, Session, Style } from '../../../packages/shared/types';
import { api, readFile } from './api';
import { PhotoResults } from './PhotoResults';
import { PrintPhoto } from './PrintPhoto';
import { wifiQrText, type WifiSettings } from '../../../packages/shared/wifi';
import { orientationLabel, type PhotoOrientation } from '../../../packages/shared/photo-orientation';
import { PhotoLibrary, timeLeft, usePhotoClock } from './PhotoLibrary';
import { ClothingPicker } from './ClothingPicker';
import { type ClothingMode } from '../../../packages/shared/clothing';
import { cameraConstraints, cameraFailure, countdownSeconds } from './camera-settings';
import { distanceHintText, type DistanceHint } from '../../../packages/shared/portrait-settings';
export { Pickup } from './Pickup';
import { PayScreen } from './PayScreen';
import type { Order } from '../../../packages/shared/payments';
import { packageSummary, visitPackage, type PhotoPackage } from '../../../packages/shared/photo-packages';
type Draft = { photo: string; consent: boolean; orientation: PhotoOrientation; clothingMode: ClothingMode };
/** The visit's package; `orderId` is set once it has been paid on the machine. */
type Plan = PhotoPackage & { orderId?: string };
type SavedRound = { ids: string[]; activeAt: number; idleMs: number; plan?: Plan; shotIds?: string[] };
/** A photo counts toward the visit's package once it has been sent for generation; drafts do not. */
const submitted = (s: Session) => !['created', 'photographed'].includes(s.status);
/** Seconds of warning before an idle visit is cleared — long enough for a slow reader to notice and answer. */
const idleWarning = 30;
const readRound = (): SavedRound | undefined => {
    try {
        const value = JSON.parse(localStorage.getItem('snap-round') || 'null');
        if (value && Array.isArray(value.ids) && value.ids.every((id: unknown) => typeof id === 'string') && Number.isFinite(value.activeAt)) return value;
    } catch { }
};
export function Booth() {
    useKioskTouch();
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
    // The visit's photo package (how many photos) and which sessions have used it up, in shot order.
    const [plan, setPlan] = useState<Plan>();
    const [order, setOrder] = useState<Order>();
    const [payQr, setPayQr] = useState('');
    const orderRef = useRef<Order | undefined>(undefined); orderRef.current = order;
    const [shotIds, setShotIds] = useState<string[]>([]);
    const roundExtra = useRef<Pick<SavedRound, 'plan' | 'shotIds'>>({}); roundExtra.current = { plan, shotIds };
    // Counts taps on the greyed-out start button, so the consent box can answer "why won't it go?".
    const [consentNudge, setConsentNudge] = useState(0);
    const [selected, setSelected] = useState<string[]>([]);
    const [pickup, setPickup] = useState('');
    const [qr, setQr] = useState('');
    const [remaining, setRemaining] = useState(120);
    const [cameraReady, setCameraReady] = useState(false);
    const [cameraAttempt, setCameraAttempt] = useState(0);
    const [confirmEnd, setConfirmEnd] = useState(false);
    const [flash, setFlash] = useState(0);
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
        if (ids.length || roundExtra.current.plan?.orderId) localStorage.setItem('snap-round', JSON.stringify({ ids, activeAt: lastAction.current, idleMs: libraryRef.current.some(s => s.status === 'generating') ? 300000 : 120000, ...roundExtra.current }));
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
    // The pickup URL is issued when generation starts, before an image exists. Restore the work, not its QR.
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
        } else if (ids.length || saved?.plan?.orderId) {
            Promise.all([Promise.all(ids.map(savedId => api<Session>(`/api/sessions/${savedId}`).catch(() => undefined))), api<Health>('/api/health')]).then(([items, h]) => {
                if (version !== epoch.current || !mounted.current) return;
                setHealth(h);
                const valid = items.filter((s): s is Session => !!s && s.mode === h.generation && s.status !== 'ended' && s.expiresAt > Date.now());
                if (saved?.plan) { roundExtra.current = { plan: saved.plan, shotIds: saved.shotIds ?? [] }; setPlan(saved.plan); setShotIds(saved.shotIds ?? []); }
                updateLibrary(valid);
                const s = valid.find(item => item.id === id);
                if (s) { setFrame(s.frame ?? 'none'); setCaption(s.caption ?? defaultCaption); applySession(s); }
                else { localStorage.removeItem('snap-session'); if (valid.length) setStep('library'); else if (saved?.plan?.orderId) setStep('styles'); }
            }).catch(() => { if (version === epoch.current) { localStorage.removeItem('snap-session'); localStorage.removeItem('snap-round'); } });
        }
        return () => { mounted.current = false; stream.current?.getTracks().forEach(t => t.stop()); if (captureTimer.current) clearInterval(captureTimer.current); };
    }, []);
    useEffect(() => { if (session) { localStorage.setItem('snap-session', session.id); remember(session); } }, [session]);
    useEffect(() => {
        const added = library.filter(s => submitted(s) && !shotIds.includes(s.id)).map(s => s.id);
        if (added.length) setShotIds(ids => [...ids, ...added]);
    }, [library]);
    useEffect(() => { saveRound(); }, [plan, shotIds]);
    useEffect(() => {
        if (!order?.qrText) return;
        let active = true;
        QRCode.toDataURL(order.qrText, { width: 320, margin: 2, color: { dark: '#33281f', light: '#ffffff' } }).then(value => { if (active) setPayQr(value); }).catch(() => {});
        return () => { active = false; };
    }, [order?.qrText]);
    useEffect(() => {
        if (step !== 'pay' || order?.status !== 'pending') return;
        const id = order.id;
        const timer = setInterval(() => { void api<Order>(`/api/orders/${id}`).then(next => { if (orderRef.current?.id === id) setOrder(next); }).catch(() => {}); }, 2000);
        return () => clearInterval(timer);
    }, [step, order?.id, order?.status]);
    useEffect(() => {
        if (step !== 'pay' || order?.status !== 'paid') return;
        const paid: Plan = { count: order.count, price: order.amount / 100, orderId: order.id };
        roundExtra.current = { plan: paid, shotIds: [] }; setPlan(paid); setShotIds([]); setOrder(undefined); setStep('styles');
    }, [step, order?.status]);
    useEffect(() => { if (session && photo) drafts.current.set(session.id, { photo, consent, orientation, clothingMode }); }, [session?.id, photo, consent, orientation, clothingMode]);
    useEffect(() => { if (step !== 'camera' || !health) {
        stopCamera();
        return;
    } let active = true; setCameraError(''); setCameraReady(false); if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('摄像头暂时无法使用，请联系工作人员。');
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
    /** Seconds without a touch before the visit is cleared: longer while a photo generates or the visitor is paying on their phone. */
    const idleLimit = () => generatingIds || step === 'pay' ? 300 : 120;
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
                        if (s.status !== 'generating' && currentStep.current === 'generating' && !['ready', 'partial'].includes(s.status)) applySession(refreshed);
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
    const [wifiQr, setWifiQr] = useState('');
    const [wifiName, setWifiName] = useState('');
    useEffect(() => {
        if (step !== 'pickup') return;
        let active = true;
        // Join-network QR first, so phones reach the LAN pickup page without typing a password.
        void (async () => {
            try {
                const wifi = await api<WifiSettings | null>('/api/wifi');
                const value = wifi?.ssid ? await QRCode.toDataURL(wifiQrText(wifi), { width: 280, margin: 2, color: { dark: '#33281f', light: '#fffaf0' } }) : '';
                if (active) { setWifiQr(value); setWifiName(wifi?.ssid ?? ''); }
            } catch { if (active) setWifiQr(''); }
        })();
        return () => { active = false; };
    }, [step]);
    const clearCurrent = () => {
        epoch.current++; busyRef.current = false; stopCamera(); frameRequest.current++; frameQueue.current = Promise.resolve();
        setFrame('none'); setCaption(defaultCaption); setOrientation('portrait'); setClothingMode('keep'); setFrameSaving(false); setFrameError('');
        setSession(undefined); setPhoto(''); setPickup(''); setQr(''); setSelected([]); setConsent(false); setConsentNudge(0); setError(''); setBusy(false);
        localStorage.removeItem('snap-session');
    };
    const finish = async () => {
        const previous = [...new Set([...libraryRef.current.map(s => s.id), ...(session ? [session.id] : [])])];
        roundEpoch.current++; clearCurrent(); setConfirmEnd(false); const version = epoch.current;
        drafts.current.clear(); cancelOrder(); setPlan(undefined); setShotIds([]); roundExtra.current = {}; updateLibrary([]); setStep('home'); lastAction.current = Date.now(); setRemaining(120);
        const results = await Promise.allSettled(previous.map(id => api(`/api/sessions/${id}/end`, {}).catch(e => { if (e.status !== 410) throw e; })));
        if (version === epoch.current && results.some(r => r.status === 'rejected')) setError('已清除屏幕内容；后台会话未能结束，请检查网络。');
    };
    useEffect(() => { const limit = idleLimit(); lastAction.current = Date.now(); setRemaining(limit); saveRound(); if (step === 'home' && !libraryRef.current.length)
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
    // Every visit is one photo. Pay before shooting: starting creates an order and shows its QR; the order is polled until paid.
    const paying = !!health?.payment && health.payment !== 'off';
    const startVisit = () => { epoch.current++; if (plan) setStep('styles'); else if (paying) startOrder(visit.count); else { setPlan(visit); setShotIds([]); setStep('styles'); } };
    const startOrder = (count: number) => run(async () => {
        const version = epoch.current; cancelOrder();
        const next = await api<Order>('/api/orders', { count });
        if (version !== epoch.current) { void api(`/api/orders/${next.id}/cancel`, {}).catch(() => {}); return; }
        setPayQr(''); setOrder(next); setStep('pay');
    });
    /** Closes an unpaid order so it cannot be paid after the visitor left this screen. */
    const cancelOrder = () => { const pending = orderRef.current; orderRef.current = undefined; setOrder(undefined); if (pending?.status === 'pending') void api(`/api/orders/${pending.id}/cancel`, {}).catch(() => {}); };
    const simulatePaid = () => run(async () => { if (orderRef.current) setOrder(await api<Order>(`/api/orders/${orderRef.current.id}/simulate-paid`, {})); });
    const choose = (style: Style, selectedPurpose: Purpose = 'self') => { if (busyRef.current)
        return; if (shotsLeft <= 0) { setError(planDone); return; } epoch.current++; return run(async () => { const version = epoch.current; const s = await api<Session>('/api/sessions', { styleId: style.id, purpose: selectedPurpose, ...(plan?.orderId ? { orderId: plan.orderId } : {}) }); if (version !== epoch.current)
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
    // Viewfinder distance feedback: a small frame goes to the local face check about once a second while the camera is live.
    // OffscreenCanvas gates the loop to real browsers; the frame is never stored and the hint only guides the visitor.
    const [distance, setDistance] = useState<DistanceHint>('unknown');
    useEffect(() => {
        if (step !== 'camera' || !cameraReady || typeof OffscreenCanvas === 'undefined') { setDistance('unknown'); return; }
        let active = true, pending = false;
        const check = async () => {
            const v = video.current;
            if (pending || !v || !v.videoWidth || !v.videoHeight) return;
            pending = true;
            try {
                const width = 320, height = Math.round(v.videoHeight * width / v.videoWidth);
                const canvas = new OffscreenCanvas(width, height);
                const context = canvas.getContext('2d');
                if (!context) return;
                context.drawImage(v, 0, 0, width, height);
                const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
                const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
                const result = await api<{ hint: DistanceHint }>('/api/camera/check', { dataUrl });
                if (active) setDistance(result.hint);
            } catch { if (active) setDistance('unknown'); }
            finally { pending = false; }
        };
        const timer = setInterval(() => void check(), 900);
        void check();
        return () => { active = false; clearInterval(timer); };
    }, [step, cameraReady]);
    const takePhoto = () => { if (count || captureTimer.current || !cameraReady || busyRef.current)
        return; const seconds = countdownSeconds(); setCount(seconds); beep(seconds <= 3 ? 1320 : 880); let left = seconds; captureTimer.current = setInterval(() => { left--; setCount(left); if (left > 0) beep(left <= 3 ? 1320 : 880); if (left === 0) {
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
        shutter(); setFlash(n => n + 1);
        setPhoto(canvas.toDataURL('image/jpeg', .92));
        setStep('confirm');
    } }, 1000); };
    const useDemoPhoto = () => run(async () => {
        if (!health?.testMode || !session) return;
        const version = epoch.current;
        const response = await fetch('/examples/film-v2.webp');
        if (!response.ok) throw new Error('测试照片未能读取，请检查素材文件。');
        const blob = await response.blob();
        // The bundled sample is WebP; visitor uploads stay limited to JPG/PNG, so convert it like a camera frame.
        const value = ['image/jpeg', 'image/png'].includes(blob.type) ? await readFile(blob) : await (async () => {
            const bitmap = await createImageBitmap(blob);
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width; canvas.height = bitmap.height;
            canvas.getContext('2d')!.drawImage(bitmap, 0, 0); bitmap.close();
            return canvas.toDataURL('image/jpeg', .92);
        })();
        if (version !== epoch.current) return;
        setPhoto(value); setConsent(false); setStep('confirm');
    });
    const startGeneration = async (s: Session, version: number) => {
        const next = await api<Session>(`/api/sessions/${s.id}/generate`, { clothingMode: s.clothingMode ?? clothingMode });
        if (version === epoch.current) applySession(next);
    };
    const generate = () => run(async () => {
        if (!session || !consent || !['created', 'photographed'].includes(session.status)) return;
        if (shotsLeft <= 0) { setError(planDone); return; }
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
    // Wait-time extras are bonuses: a failed save never interrupts the visitor.
    const saveFortune = (fortune: string) => { if (!session) return; const id = session.id;
        void api<Session>(`/api/sessions/${id}/fortune`, { fortune }).then(s => { if (currentSession.current?.id === id) setSession(current => current && { ...current, fortune: s.fortune }); }).catch(() => { }); };
    const saveDecorated = (dataUrl: string | null) => { if (!session) return; const id = session.id;
        void api<Session>(`/api/sessions/${id}/decorated`, { dataUrl }).then(s => { if (currentSession.current?.id === id) setSession(current => current && { ...current, decoratedUrl: s.decoratedUrl }); }).catch(() => { }); };
    const openPickup = () => {
        if (!session?.pickupUrl || busyRef.current || frameSaving || frameError) return;
        setPickup(session.pickupUrl); setStep('pickup');
    };
    const style = styles.find(s => s.id === session?.styleId);
    const chosenImage = session?.images.find(img => selected.includes(img.id)) ?? session?.images[0];
    const deliveryImage = chosenImage ? { src: chosenImage.previewUrl, framed: true } : (photo || session?.originalUrl) ? { src: photo || session!.originalUrl!, framed: false } : undefined;
    const lockedPhoto = !!session && !['created', 'photographed'].includes(session.status);
    const index = ['home', 'styles'].includes(step) ? 0 : ['camera', 'confirm'].includes(step) ? 1 : step === 'generating' ? 2 : 3;
    // A first visit is one straight path; the round library only matters once another photo exists.
    const otherPhotos = library.some(s => s.id !== session?.id);
    const unavailable = !!health && health.generation === 'seedream' && !health.configured;
    const visit: PhotoPackage = health?.packages?.[0] ?? visitPackage();
    const shotsLeft = plan ? Math.max(0, plan.count - shotIds.length) : Infinity;
    const planDone = '这次的照片已经拍完了。';
    // Generation cannot be undone, so its page has no back; results lead back only to other photos.
    const showBack = step !== 'generating' && (step !== 'results' || otherPhotos);
    return <div data-step={step} className={`shell kiosk-shell ${step === 'home' ? 'is-idle' : ''}`}><header><StaffEntry /><div className="header-right">{count === 0 && <div className="visit-actions">{otherPhotos && <button className="text-button" disabled={busy || frameSaving || !!frameError || step === 'library'} onClick={openLibrary}>本轮照片库</button>}{(library.length > 0 || step === 'library') && <button className="text-button" onClick={() => setConfirmEnd(true)}>结束本次</button>}</div>}{health?.testMode && <span className="mode"><i />测试模式</span>}</div></header>
 <main ref={motionMain}>{step === 'home' ? <AttractScreen styles={styles} unavailable={unavailable} note={[packageSummary(visit), '等照片时可以玩小游戏'].filter(Boolean).join(' · ')} onStart={startVisit} /> : step === 'pay' && order ? <PayScreen order={order} qr={payQr} now={now} busy={busy} onBack={() => { cancelOrder(); setStep('home'); }} onRenew={() => startOrder(order.count)} onSimulate={order.provider === 'mock' && health?.testMode ? simulatePaid : undefined} /> : step === 'styles' ? <ThemePicker styles={styles} loading={stylesLoading} busy={busy} error={error} onBack={() => { epoch.current++; if (plan && !shotIds.length && !plan.orderId) setPlan(undefined); setStep('home'); }} onChoose={choose} /> : step === 'library' ? <PhotoLibrary sessions={library} draftPhoto={id => drafts.current.get(id)?.photo || ''} now={now} busy={busy} onOpen={openPhoto} canAddMore={shotsLeft > 0} onNew={() => setStep('styles')} onBack={() => setStep(session && !['home', 'styles', 'library'].includes(libraryFrom.current) ? libraryFrom.current : 'styles')} /> : <><div className="step-bar">{showBack ? <button className="secondary step-back" disabled={busy || frameSaving || !!frameError || count > 0} onClick={back}>← {step === 'results' ? '返回照片库' : step === 'pickup' ? (session?.images.length ? '返回照片' : '返回生成状态') : '返回上一步'}</button> : <span className="step-back-spacer" aria-hidden="true" />}<nav className="progress" aria-label="拍照进度">{['主题', '拍照', '生成', '取图'].map((text, i) => <span className={i === index ? 'active current' : i < index ? 'active complete' : ''} aria-current={i === index ? 'step' : undefined} key={text}><b>{i < index ? '✓' : `0${i + 1}`}</b>{text}</span>)}</nav>{!!session?.images.length && step !== 'pickup' && <span className="photo-expiry">剩余保存 <b>{timeLeft(session.expiresAt, now)}</b> · 到期自动删除</span>}</div>
 {['camera', 'confirm'].includes(step) && <section className="capture-layout"><div className="camera-frame">{step === 'camera' ? <><video ref={video} muted playsInline autoPlay className="mirror" onPlaying={e => { const v = e.currentTarget; if (stream.current?.active && v.videoWidth > 0 && v.videoHeight > 0) { setCameraReady(true); setCameraError(''); } }} onWaiting={() => setCameraReady(false)}/><div className="viewfinder"/>{cameraReady && <PoseGuide distance={distance} />}{cameraReady && <div className={`distance-hint distance-${distance}`} role="note">{distanceHintText[distance]}</div>}{!cameraReady && <div className="camera-placeholder"><span>◎</span><p>{health?.testMode ? '上传照片或使用测试照片' : cameraError ? '摄像头需要你帮个忙' : '正在打开摄像头…'}</p></div>}{count > 0 && <div className="countdown" role="status" aria-live="assertive"><b>{count}</b><span>{count > 3 ? '退到约一米外，面向镜头' : '看镜头，保持微笑'}</span></div>}</> : <img src={photo || session?.originalUrl} alt="刚刚拍摄或上传的照片"/>}</div><div className="capture-copy"><div className="capture-theme"><span className="selected-theme">{style?.name || session?.styleName}</span></div><h1>{step === 'camera' ? <>看向镜头</> : <>确认照片</>}</h1>{step === 'camera' ? <><ul className="capture-tips" aria-label="拍照提示"><li><b>站位</b>退到约一米外</li><li><b>入镜</b>头顶到腰部都在画面里</li><li><b>表情</b>成片会参考这张，放松嘴角，想件开心的事</li></ul><button className="primary capture-button" disabled={!cameraReady || count > 0 || busy} onClick={takePhoto}>◎ {count ? `${count} 秒后拍摄` : '拍照'}</button><p className="capture-countdown-note">按下后有 {countdownSeconds()} 秒准备时间，拍完可以重拍</p>{cameraError && <><p role="alert" className="error">{cameraError}</p><button className="secondary" onClick={() => setCameraAttempt(n => n + 1)}>重新连接摄像头</button></>}{photo && <button className="secondary" disabled={busy || count > 0} onClick={() => setStep('confirm')}>使用刚才的照片</button>}{health?.testMode && <details className="photo-options"><summary>使用其他照片</summary><label className="upload-link">上传照片<input type="file" accept="image/jpeg,image/png" disabled={count > 0 || busy} onChange={e => { const file = e.target.files?.[0]; const version = epoch.current; if (file)
            void run(async () => { const value = await readFile(file); if (version !== epoch.current)
                return; setPhoto(value); setStep('confirm'); }); e.target.value = ''; }}/></label></details>}{health?.testMode && <div className="demo-photo-entry"><button className="secondary" disabled={busy || count > 0} onClick={useDemoPhoto}>使用测试照片</button><p className="fine-print">测试样图，仅在测试模式显示。</p></div>}</> : lockedPhoto ? <><p className="locked-photo-note">{session?.status === 'generating' ? '正在生成，返回不会中断。' : '已提交生成，可查看结果。'}</p><button className="primary" onClick={() => setStep(session?.images.length ? 'results' : 'generating')}>{session?.images.length ? '查看生成照片' : '查看生成进度'}</button><button className="secondary" onClick={openLibrary}>查看本轮照片库</button></> : <>{style?.generationPreset === 'coming-of-age' || session?.styleId === 'coming-of-age' ? <div className="poster-settings"><strong>成人礼海报 · 2:3</strong><p>深蓝换装 · 含“你好 / 我的18岁”文字</p></div> : style?.generationPreset === 'directed-portrait' ? <><div className="poster-settings"><strong>固定{orientationLabel(orientation)}</strong></div><ClothingPicker value={clothingMode} onChange={setClothingMode} disabled={busy} /></> : <><fieldset className="orientation-picker" disabled={busy || (!photo && !!session?.originalUrl)}><legend>照片比例</legend><div className="orientation-options">{([{id:'portrait',name:'竖版',ratio:'3:4'},{id:'landscape',name:'横版',ratio:'4:3'}] as const).map(item=><button type="button" key={item.id} className={orientation===item.id?'selected':''} aria-pressed={orientation===item.id} onClick={()=>setOrientation(item.id)}><span className={`orientation-shape ${item.id}`} aria-hidden="true"/><span><strong>{item.name}</strong><small>{item.ratio}</small></span><i aria-hidden="true">{orientation===item.id?'✓':''}</i></button>)}</div></fieldset><ClothingPicker value={clothingMode} onChange={setClothingMode} disabled={busy} /></>}<div className="confirm-actions"><label className={`consent ${consent ? '' : 'needs-consent'}`} data-nudge={!consent && consentNudge ? consentNudge % 2 : undefined}><input type="checkbox" checked={consent} onChange={e => { setConsent(e.target.checked); setConsentNudge(0); }}/><span>{health?.generation === 'seedream' ? '同意上传照片至云端生成。生成后 10 分钟自动删除。' : '同意本机处理照片。生成后 10 分钟自动删除。'}</span></label><div className="confirm-buttons"><button className="secondary" disabled={busy} onClick={() => { if (session) drafts.current.delete(session.id); setPhoto(''); setConsent(false); setStep('camera'); }}>重新拍一张</button><span className="generate-slot"><button className="primary" disabled={!health || !consent || busy || (health?.generation === 'seedream' && !health.configured)} onClick={generate}>{busy ? '正在提交…' : '开始生成 →'}</button>{!consent && !busy && <span className="consent-catch" aria-hidden="true" onClick={() => setConsentNudge(n => n + 1)} />}</span></div>{!consent && <p className={`consent-hint ${consentNudge ? 'is-nudged' : ''}`}>{consentNudge ? '↑ 请先点一下上面的「同意」，再开始生成' : '勾选上方同意后即可开始'}</p>}{health?.generation === 'seedream' && !health.configured && <p className="error">暂时无法生成照片，请联系工作人员。<small className="staff-code">Seedream 尚未配置</small></p>}</div></>}</div></section>}
 {step === 'generating' && session && <WaitExperience key={session.id} session={session} photo={photo || session.originalUrl || ''} styles={styles} frame={frame} caption={caption} orientation={session.orientation ?? orientation} busy={busy}
            onRetry={retry} onSaveOriginal={openPickup} onFrame={changeFrame} onFortune={saveFortune} onDecorated={saveDecorated}
            onRevealed={() => { if (currentSession.current?.images.length) { setSelected(previous => previous.length ? previous : currentSession.current!.images.slice(0, 1).map(i => i.id)); setStep('results'); } }} />}
 {step === 'results' && session && <><PhotoResults session={session} photo={photo} fortune={fortuneById(session.fortune)} selected={selected} frame={frame} caption={caption} busy={busy || frameSaving || !!frameError} onSelect={id => setSelected([id])} onPickup={openPickup}><FramePicker photo={chosenImage?.previewUrl} recommended={recommendedFrame(session?.styleId || "", session?.purpose)} value={frame} caption={caption} onCaptionChange={value => changeFrame(frame, value)} onChange={changeFrame} saving={frameSaving} error={frameError} wide={session.orientation?.startsWith('landscape')} /></PhotoResults></>}
 {step === 'pickup' && <section className="delivery" data-orientation={deliveryImage?.framed ? session?.orientation : undefined}><div className="delivery-photo">{deliveryImage && <PhotoFrame src={deliveryImage.src} alt="将要保存的照片" frame={deliveryImage.framed ? frame : 'none'} caption={caption} />}</div><div className="delivery-side"><h1>扫码取图</h1>{session && <p className="pickup-countdown"><b>{timeLeft(session.expiresAt, now)}</b> 后自动删除，请尽快保存</p>}<div className={`delivery-codes ${wifiQr ? 'has-wifi' : ''}`}>{wifiQr && <div className="qr-ticket wifi-ticket"><span className="qr-step">1</span><strong>先连 Wi-Fi</strong><img src={wifiQr} alt="连接 Wi-Fi 二维码" /><small>{wifiName}</small></div>}<div className="qr-ticket">{wifiQr && <span className="qr-step">2</span>}<strong>{wifiQr ? '再扫码取图' : '手机相机扫一扫'}</strong>{qr ? <img src={qr} alt="手机取图二维码" /> : <p>正在生成二维码…</p>}<small>{wifiQr ? '用手机相机扫一扫，原片也会一起保存' : '用手机相机或微信扫一扫，AI 成片和原片一起保存'}</small>{health?.testMode && <a href={pickup} target="_blank" rel="noreferrer">在当前设备打开相册 ↗</a>}</div></div>{session && selected[0] && <PrintPhoto sessionId={session.id} imageId={selected[0]} disabled={busy} hideWhenUnavailable />}{session?.decoratedUrl && <PrintPhoto sessionId={session.id} imageId={decoratedPrintId} label="打印贴纸原片" disabled={busy} hideWhenUnavailable />}<div className="delivery-actions"><button className="primary delivery-done" onClick={() => void finish()}>已保存，完成</button></div></div></section>}
 </>}{error && <div role="alert" className="error global-error">{error}{['home', 'styles'].includes(step) && <button className="secondary" disabled={stylesLoading} onClick={() => setConfigAttempt(value => value + 1)}>重新连接</button>}<button className="text-button" onClick={() => setError('')} aria-label="关闭错误提示">×</button></div>}{remaining <= idleWarning && (step !== 'home' || library.length > 0) && <div className="kiosk-dialog idle-dialog" role="alertdialog" aria-modal="true" aria-label="还在使用吗"><div className="kiosk-dialog-card"><h2>还在使用吗？</h2><p className="idle-count"><b>{remaining}</b> 秒后回到首页</p><p>回到首页时，屏幕上的照片会清除。{['results', 'pickup'].includes(step) ? '已经扫码存到手机的照片不受影响。' : ''}</p><button className="primary" onClick={() => { lastAction.current = Date.now(); setRemaining(idleLimit()); saveRound(); }}>我还在，继续</button></div></div>}{confirmEnd && <div className="kiosk-dialog" role="alertdialog" aria-modal="true" aria-label="确认结束本次"><div className="kiosk-dialog-card"><h2>确定结束本次吗？</h2><p>结束后屏幕上的照片会立即清除。还没扫码或打印的照片将无法再取回。{plan?.orderId && shotsLeft > 0 ? '已付款的这张还没拍，结束后不能再拍。' : ''}</p><button className="primary" onClick={() => setConfirmEnd(false)}>继续拍照</button><button className="secondary" onClick={() => { setConfirmEnd(false); void finish(); }}>确认结束</button></div></div>}</main>{flash > 0 && <div key={flash} className="shutter-flash" aria-hidden="true" />}</div>;
}
