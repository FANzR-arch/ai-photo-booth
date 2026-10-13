import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { GenerationPreview } from '../GenerationPreview';
import { PhotoFrame } from '../PhotoFrame';
import { BubbleGame, MemoryGame, SnapGame, type MemoryFace } from './games';
import { StickerLayer, StickerTray, addSticker, composeDecorated, type Sticker } from './stickers';
import { Reveal, type RevealStep } from './Reveal';
import { Art } from './Art';
import { fortuneSrc, lotSrc, waitArt, waitLots, type WaitLotId } from '../../../../packages/shared/wait-assets';
import { recommendedFrame } from '../../../../packages/shared/portrait-experience';
import { frames, type Caption, type FrameId } from '../../../../packages/shared/frames';
import { drawFortune, fortuneById, type Fortune } from '../../../../packages/shared/fortunes';
import { fortuneSet, revealMs, slowNotice, snapCharacters, stageAt, stickerSets, waitAudience, waitGameCycle, waitGameNames, waitGames, waitTiming as T, type WaitGame } from '../../../../packages/shared/wait-experience';
import type { PhotoOrientation } from '../../../../packages/shared/photo-orientation';
import type { Session, Style } from '../../../../packages/shared/types';

type Phase = 'intro' | 'fortune' | 'play' | 'finale' | 'reveal' | 'stopped';
const tickMs = 250;

/**
 * The whole generation wait: a short opening, a fortune slip, a game beside the photo being "painted",
 * calm notes when it runs long, and a reveal that hands over to the results page.
 * One 250 ms clock drives every step so timing stays predictable (and testable with fake intervals).
 */
export function WaitExperience({ session, photo, styles, frame, caption, orientation, busy, onRetry, onSaveOriginal, onFrame, onFortune, onDecorated, onRevealed }: {
    session: Session; photo: string; styles: Style[]; frame: FrameId; caption: Caption; orientation: PhotoOrientation; busy: boolean;
    onRetry: () => void; onSaveOriginal: () => void; onFrame: (id: FrameId) => void; onFortune: (id: string) => void;
    onDecorated: (dataUrl: string | null) => void; onRevealed: () => void;
}) {
    const style = styles.find(s => s.id === session.styleId);
    const audience = waitAudience(session.styleId, style?.subjectCount);
    const set = fortuneSet(audience);
    const [primary, secondary] = waitGames[audience];
    const status = session.status;
    const ready = status === 'ready' || status === 'partial', stopped = status === 'failed' || status === 'unknown';
    const start = useRef(session.startedAt && session.startedAt <= Date.now() ? session.startedAt : Date.now());
    const [ms, setMs] = useState(() => Date.now() - start.current);
    // A wait that resumes (page reload, or no photo in memory) skips the opening and goes straight to play.
    const [phase, setPhase] = useState<Phase>(() => stopped ? 'stopped' : ready ? 'reveal' : (!photo || Date.now() - start.current > 6000) ? 'play' : 'intro');
    const [phaseAt, setPhaseAt] = useState(ms);
    const go = (next: Phase, at = ms) => { setPhase(next); setPhaseAt(at); };
    const [fortune, setFortune] = useState<Fortune | undefined>(() => fortuneById(session.fortune));
    const [fortuneAt, setFortuneAt] = useState<number>();
    const [game, setGame] = useState<WaitGame>(primary);
    const [gameAt, setGameAt] = useState(ms);
    const [touched, setTouched] = useState(false);
    const [switching, setSwitching] = useState<number>();
    const switched = useRef(false);
    const [framesAt, setFramesAt] = useState<number>();
    const framesShown = useRef(false);
    const [stickers, setStickers] = useState<Sticker[]>([]);
    const stickerId = useRef(0);
    const overlay = useRef<HTMLDivElement>(null);
    const uploaded = useRef(false);
    const done = useRef(false);

    useEffect(() => {
        const timer = setInterval(() => setMs(value => Math.max(value + tickMs, Date.now() - start.current)), tickMs);
        return () => clearInterval(timer);
    }, []);

    // Retrying after a failure restarts the clock and goes straight back to play.
    useEffect(() => {
        if (status === 'generating' && phase === 'stopped') {
            start.current = Date.now(); setMs(0); go('play', 0); setGameAt(0); setTouched(false); switched.current = false; framesShown.current = false;
        }
    }, [status]);

    useEffect(() => {
        if (stopped) { if (phase !== 'stopped') go('stopped'); return; }
        const t = ms - phaseAt;
        if (phase === 'intro' && t >= T.introMs) go(ready ? 'reveal' : set && !fortune ? 'fortune' : 'play');
        else if (phase === 'fortune') {
            if (ready) go('reveal');
            else if (fortuneAt !== undefined ? ms - fortuneAt >= T.fortuneShowMs : t >= T.fortuneOfferMs) { go('play'); setGameAt(ms); }
        }
        else if (phase === 'play' && ready) go('finale');
        else if (phase === 'finale' && t >= T.finaleMs) go('reveal');
        else if (phase === 'reveal' && (t >= revealMs || !session.images.length) && !done.current) { done.current = true; onRevealed(); }
    }, [ms, status, phase]);

    // After a minute: finish the first game and offer the second (stickers stay, or the decorations would be lost).
    useEffect(() => {
        if (phase !== 'play') return;
        if (!switched.current && ms >= T.switchAtMs && game === primary && game !== 'stickers') { switched.current = true; setSwitching(ms); }
        if (switching !== undefined && ms - switching >= T.finaleMs) { setSwitching(undefined); setGame(secondary); setGameAt(ms); setTouched(false); }
        if (!framesShown.current && ms >= T.framesAtMs) { framesShown.current = true; setFramesAt(ms); }
        if (framesAt !== undefined && ms - framesAt >= T.framesShowMs) setFramesAt(undefined);
    }, [ms, phase]);

    // Upload the decorated original a moment after the last change, and immediately when the photo is ready.
    useEffect(() => {
        if (!stickers.length && !uploaded.current) return;
        const send = () => {
            if (!stickers.length) { uploaded.current = false; onDecorated(null); return; }
            const box = overlay.current?.getBoundingClientRect();
            void composeDecorated(photo, stickers, { width: box?.width ?? 0, height: box?.height ?? 0 })
                .then(dataUrl => { uploaded.current = true; onDecorated(dataUrl); }).catch(() => { /* decoration is a bonus; the photo itself is unaffected */ });
        };
        if (phase === 'finale' || phase === 'reveal') { send(); return; }
        const timer = setTimeout(send, 1500);
        return () => clearTimeout(timer);
    }, [stickers, phase === 'finale']);

    const draw = () => {
        if (!set) return;
        const next = fortune ?? drawFortune(set);
        if (!fortune) { setFortune(next); onFortune(next.id); }
        setFortuneAt(ms);
    };
    const switchGame = () => {
        const options = waitGameCycle;
        setGame(options[(options.indexOf(game) + 1) % options.length]); setGameAt(ms); setTouched(false); setSwitching(undefined); switched.current = true;
    };

    const faces = useMemo<MemoryFace[]>(() => (Object.keys(waitLots) as WaitLotId[]).map(id => ({ src: lotSrc(id), name: waitLots[id].name })), []);
    const characters = useMemo(() => snapCharacters(session.styleId), [session.styleId]);
    const frameOptions = useMemo(() => [...new Set<FrameId>([recommendedFrame(session.styleId, session.purpose), 'none', 'instant', 'film', 'rose'])].slice(0, 4), [session.styleId, session.purpose]);

    const seconds = Math.floor(ms / 1000);
    const finale = phase === 'finale' || switching !== undefined;
    const demo = phase === 'play' && !finale && framesAt === undefined && (ms - gameAt < 1800 || (!touched && ms - gameAt >= T.demoIdleMs && ms - gameAt < T.demoIdleMs + 1800));
    const image = session.images[0];

    if (phase === 'reveal' && image) {
        const t = ms - phaseAt, step: RevealStep = !photo ? (t < T.flipMs + T.developMs ? 'develop' : 'compare') : t < T.flipMs ? 'flip' : t < T.flipMs + T.developMs ? 'develop' : 'compare';
        return <section className="waiting wait-experience" data-phase="reveal" data-orientation={orientation}>
            <Reveal step={step} original={photo} result={image.previewUrl} frame={frame} caption={caption} orientation={session.orientation ?? orientation} theme={style?.name || session.styleName}
                onTap={() => { if (step === 'compare') { if (!done.current) { done.current = true; onRevealed(); } } else setPhaseAt(ms - T.flipMs - T.developMs); }} />
        </section>;
    }

    const stickerMode = game === 'stickers' && phase !== 'stopped';
    return <section className="waiting wait-experience" data-phase={phase} data-orientation={session.orientation ?? orientation}>
        <div className={`wait-photo ${phase === 'intro' ? 'is-arriving' : ''}`}>
            <GenerationPreview photo={photo} active={status === 'generating' || phase === 'finale'} demo={session.mode === 'demo'} theme={style?.name || session.styleName}
                frame={stickerMode ? 'none' : frame} caption={stickerMode ? undefined : caption} orientation={session.orientation ?? orientation} seconds={seconds}
                stage={ready ? '完成' : stageAt(ms).label} notice={phase === 'play' ? slowNotice(ms) : undefined}
                overlay={stickerMode ? <div ref={overlay} className="sticker-overlay"><StickerLayer stickers={stickers} finale={finale} onRemove={id => setStickers(list => list.filter(s => s.id !== id))} /></div> : undefined} />
        </div>
        <div className="waiting-play" onPointerDownCapture={() => setTouched(true)}>
            {phase === 'stopped' ? <Stopped session={session} busy={busy} onRetry={onRetry} onSaveOriginal={onSaveOriginal} /> : <>
                <div className="waiting-status">
                    {set && phase !== 'intro' && phase !== 'fortune' && <button type="button" className="fortune-chip" onClick={draw} aria-label={fortune ? `再看看上镜签：${fortune.level}` : '抽一支上镜签'}>{fortune ? fortune.level : '抽签'}</button>}
                    <div><strong>{ready ? '照片画好了！' : 'AI 正在绘制你的照片'}</strong><p>{ready ? '马上为你揭晓' : '大约 1 分钟，画好会自动显示'}</p></div>
                    {phase === 'play' && <button type="button" className="game-switch" onClick={switchGame} aria-label={`换个玩法，下一个是${waitGameNames[waitGameCycle[(waitGameCycle.indexOf(game) + 1) % waitGameCycle.length]]}`}><span aria-hidden="true">⇄</span>换个玩法</button>}
                </div>
                <div className="wait-stage">
                    {phase === 'intro' && <div className="wait-intro" role="status"><Art src={waitArt.studio} emoji="🎨" className="wait-easel" /><strong>收到！</strong><p>照片已送进 AI 画室</p></div>}
                    {phase === 'fortune' && set && <FortunePanel fortune={fortune} onDraw={draw} />}
                    {(phase === 'play' || phase === 'finale') && <>
                        {game === 'bubbles' && <BubbleGame audience={audience} finale={finale} />}
                        {game === 'memory' && <MemoryGame faces={faces} finale={finale} />}
                        {game === 'snap' && <SnapGame characters={characters} finale={finale} />}
                        {game === 'stickers' && <StickerTray set={stickerSets[audience]} count={stickers.length} finale={finale} onAdd={art => setStickers(list => addSticker(list, art, ++stickerId.current))} />}
                        {demo && <span className="demo-hand" aria-hidden="true">👆</span>}
                        {phase === 'play' && fortuneAt !== undefined && ms - fortuneAt < T.fortuneShowMs && fortune && <div className="fortune-overlay" onClick={() => setFortuneAt(undefined)}><FortuneSlip fortune={fortune} /></div>}
                        {phase === 'play' && framesAt !== undefined && <div className="frame-offer" role="dialog" aria-label="先挑个边框">
                            <strong>照片快画好了，先挑个边框？</strong>
                            <div className="frame-offer-options">{frameOptions.map(id => <button type="button" key={id} aria-pressed={frame === id} aria-label={frames.find(f => f.id === id)!.name} onClick={() => { onFrame(id); setFramesAt(undefined); }}>
                                {photo ? <PhotoFrame src={photo} alt="" frame={id} /> : <span className="frame-offer-blank" />}<span>{frames.find(f => f.id === id)!.name}</span></button>)}</div>
                            <button type="button" className="text-button" onClick={() => setFramesAt(undefined)}>继续玩 →</button>
                        </div>}
                    </>}
                </div>
            </>}
        </div>
    </section>;
}

/** The illustrated slip with its words drawn in; the text version stands in while that picture is missing. */
function FortuneSlip({ fortune }: { fortune: Fortune }) {
    const [failed, setFailed] = useState(false);
    if (!failed) return <img className="fortune-slip-art" src={fortuneSrc(fortune.id)} alt={`上镜签 ${fortune.level}：${fortune.text}`} draggable={false} onError={() => setFailed(true)} />;
    return <div className="fortune-slip" style={{ '--slip': `url(${waitArt.fortune[fortune.set]})` } as CSSProperties}><small>上镜签</small><b>{fortune.level}</b><p>{fortune.text}</p></div>;
}

/** The illustrated tube; while its PNG is missing, a drawn stand-in with the 签 character. */
function FortuneTube() {
    const [failed, setFailed] = useState(false);
    return failed ? <><span aria-hidden="true" className="fortune-sticks"><i /><i /><i /></span><span className="fortune-can" aria-hidden="true">签</span></>
        : <img className="fortune-tube-art" src={waitArt.fortuneTube} alt="" draggable={false} onError={() => setFailed(true)} />;
}

function FortunePanel({ fortune, onDraw }: { fortune?: Fortune; onDraw: () => void }) {
    return <div className="fortune-panel">
        {fortune ? <FortuneSlip fortune={fortune} /> : <button type="button" className="fortune-tube" onClick={onDraw} data-demo=""><FortuneTube /><strong>点一下，抽支上镜签</strong></button>}
    </div>;
}

function Stopped({ session, busy, onRetry, onSaveOriginal }: { session: Session; busy: boolean; onRetry: () => void; onSaveOriginal: () => void }) {
    const unknown = session.status === 'unknown';
    return <div className="wait-stopped" role="alert">
        <strong>{unknown ? '结果还没确定' : '这次没画成功，不是你的问题'}</strong>
        <p>{unknown ? '请找工作人员帮你看一下。为避免重复扣费，不提供自动重试。' : '可以免费再画一张，原片也一直保留着。'}</p>
        {session.error && <small className="staff-code">{session.error}</small>}
        {!unknown && <button className="primary" onClick={onRetry} disabled={busy}>{busy ? '正在重新开始…' : '免费重新画一张'}</button>}
        {session.pickupUrl && <button className="secondary" disabled={busy} onClick={onSaveOriginal}>先把原片存到手机</button>}
    </div>;
}
