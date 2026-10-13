import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { bubbleSkins, type WaitAudience } from '../../../../packages/shared/wait-experience';
import { friendSrc, stickerSrc, waitArt, waitFriends, waitStickers, type WaitFriendId, type WaitStickerId } from '../../../../packages/shared/wait-assets';
import { Art } from './Art';

/** Every game: tap only, no losing, and a short `finale` that finishes it on its own when the photo is ready. */
type GameProps = { audience: WaitAudience; finale: boolean };
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const shuffle = <T,>(items: T[]) => { const list = [...items]; for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; };

type Bubble = { id: number; x: number; y: number; size: number; color: string; skin: WaitStickerId; gold: boolean; rise: number; drift: number; popped: boolean };
const colors = ['#ff6a3d', '#ffc531', '#25b88d', '#4c9aff', '#ff7eb6', '#9b7bff'];

/** A1 戳泡泡：themed bubbles, an occasional gold one worth three, and a combo for quick taps. */
export function BubbleGame({ audience, finale }: GameProps) {
    const [bubbles, setBubbles] = useState<Bubble[]>([]);
    const [score, setScore] = useState(0);
    const [combo, setCombo] = useState({ count: 0, at: 0, key: 0 });
    const next = useRef(0);
    const [reduced] = useState(reducedMotion);
    const skins = bubbleSkins[audience];
    useEffect(() => {
        if (finale) { setBubbles(list => list.map(b => ({ ...b, popped: true }))); return; }
        const spawn = () => setBubbles(list => {
            const id = ++next.current, gold = id % 12 === 0;
            const bubble = { id, x: 4 + Math.random() * 80, y: 8 + Math.random() * 62, size: (gold ? 170 : 110) + Math.random() * 70, color: gold ? '#f5b51b' : colors[id % colors.length], skin: gold ? 'star' : skins[id % skins.length], gold, rise: 5200 + Math.random() * 2800, drift: Math.random() * 80 - 40, popped: false };
            // Rising bubbles leave on their own; still bubbles (reduced motion) make room by replacing the oldest.
            return reduced ? [...list, bubble].slice(-6) : list.length >= 9 ? list : [...list, bubble];
        });
        spawn();
        const timer = setInterval(spawn, reduced ? 1400 : 650);
        return () => clearInterval(timer);
    }, [reduced, finale, skins]);
    const remove = (id: number) => setBubbles(list => list.filter(b => b.id !== id));
    const pop = (bubble: Bubble) => {
        if (bubble.popped || finale) return;
        const now = Date.now();
        setCombo(c => ({ count: now - c.at < 1200 ? c.count + 1 : 1, at: now, key: c.key + 1 }));
        setScore(value => value + (bubble.gold ? 3 : 1));
        if (reduced) remove(bubble.id);
        else setBubbles(list => list.map(b => b.id === bubble.id ? { ...b, popped: true } : b));
    };
    return <div className={`wait-game bubble-game ${finale ? 'is-finale' : ''}`} data-game="bubbles" aria-label="等待小游戏：戳泡泡">
        <div className="bubble-score"><span>戳泡泡</span><b aria-live="off">{score}</b></div>
        {combo.count >= 2 && !finale && <span key={combo.key} className="bubble-combo" aria-hidden="true">×{combo.count}</span>}
        {finale && <p className="game-finale" aria-hidden="true">全部戳破！</p>}
        {bubbles.map((b, i) => <div key={b.id} className="bubble-lane" aria-hidden="true" onAnimationEnd={() => remove(b.id)}
            style={{ left: `${b.x}%`, width: b.size, '--rise': `${b.rise}ms`, '--drift': `${b.drift}px`, '--size': `${b.size}px`, ...(reduced ? { transform: `translateY(${b.y}%)` } : {}) } as CSSProperties}>
            <div className={`bubble ${b.gold ? 'is-gold' : ''} ${b.popped ? 'is-popped' : ''}`} data-demo={i === 0 ? '' : undefined} style={{ '--bubble': b.color } as CSSProperties} onPointerDown={() => pop(b)}><Art src={stickerSrc(b.skin)} emoji={waitStickers[b.skin].emoji} className="bubble-art" /></div>
        </div>)}
    </div>;
}

type Card = { key: number; pair: number };
export type MemoryFace = { src: string; name: string };
/** A5 翻牌配对：four pairs of auspicious lot cards (大吉、中吉…); each round shows the next four of eight. */
export function MemoryGame({ faces, finale }: { faces: MemoryFace[]; finale: boolean }) {
    const [round, setRound] = useState(0);
    const deck = useRef<Card[]>([]);
    const [cards, setCards] = useState<Card[]>(() => (deck.current = shuffle([0, 1, 2, 3, 0, 1, 2, 3].map((pair, key) => ({ key, pair })))));
    const [open, setOpen] = useState<number[]>([]);
    const [matched, setMatched] = useState<number[]>([]);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    useEffect(() => () => clearTimeout(timer.current), []);
    const pairFace = (pair: number) => faces[(round * 4 + pair) % faces.length];
    const flip = (index: number) => {
        if (finale || open.includes(index) || open.length === 2 || matched.includes(cards[index].pair)) return;
        const nextOpen = [...open, index];
        setOpen(nextOpen);
        if (nextOpen.length < 2) return;
        const [a, b] = nextOpen.map(i => cards[i]);
        if (a.pair === b.pair) {
            const done = [...matched, a.pair];
            setMatched(done); setOpen([]);
            if (done.length === 4) timer.current = setTimeout(() => { setRound(r => r + 1); setMatched([]); setCards(shuffle(cards)); }, 1400);
        } else timer.current = setTimeout(() => setOpen([]), 900);
    };
    const complete = finale || matched.length === 4;
    return <div className={`wait-game memory-game ${finale ? 'is-finale' : ''}`} data-game="memory" aria-label="等待小游戏：翻牌配对">
        <div className="memory-grid">{cards.map((card, i) => {
            const face = pairFace(card.pair), up = finale || open.includes(i) || matched.includes(card.pair);
            return <button type="button" key={`${round}-${card.key}`} className={`memory-card ${up ? 'is-up' : ''} ${matched.includes(card.pair) ? 'is-matched' : ''}`} aria-label={up ? face.name : '翻开这张牌'} aria-pressed={up} data-demo={i === 0 ? '' : undefined} onClick={() => flip(i)}>
                <span className="memory-back" aria-hidden="true"><Art src={waitArt.cardBack} emoji="?" /></span>
                <span className="memory-face" aria-hidden="true"><Art src={face.src} emoji={face.name} className="lot-art" /></span>
            </button>;
        })}</div>
        {complete && <p className="game-finale" aria-hidden="true">全部配齐！</p>}
    </div>;
}

type Pop = { id: number; slot: number; char: WaitFriendId; born: number };
/** A6 抓拍：little characters peek out of six windows; a tap "takes their photo". Slow and never penalised. */
export function SnapGame({ characters, finale }: { characters: WaitFriendId[]; finale: boolean }) {
    const [up, setUp] = useState<Pop[]>([]);
    const [shots, setShots] = useState<WaitFriendId[]>([]);
    const [flash, setFlash] = useState<{ slot: number; key: number }>();
    const next = useRef(0);
    useEffect(() => {
        if (finale) return;
        const tick = () => setUp(list => {
            const now = Date.now(), alive = list.filter(p => now - p.born < 2500);
            if (alive.length >= 2) return alive;
            const free = [0, 1, 2, 3, 4, 5].filter(slot => !alive.some(p => p.slot === slot));
            const id = ++next.current;
            return [...alive, { id, slot: free[Math.floor(Math.random() * free.length)], char: characters[id % characters.length], born: now }];
        });
        tick();
        const timer = setInterval(tick, 1100);
        return () => clearInterval(timer);
    }, [finale, characters]);
    const snap = (pop: Pop) => {
        if (finale) return;
        setUp(list => list.filter(p => p.id !== pop.id));
        setShots(list => [...list, pop.char].slice(-30));
        setFlash({ slot: pop.slot, key: pop.id });
    };
    return <div className={`wait-game snap-game ${finale ? 'is-finale' : ''}`} data-game="snap" aria-label="等待小游戏：抓拍">
        <div className="snap-count"><span>抓拍</span><b>{shots.length}</b><span>张</span></div>
        <div className="snap-pile" aria-hidden="true">{shots.slice(-4).map((char, i) => <i key={i} style={{ '--tilt': `${(i % 2 ? 1 : -1) * (4 + i * 3)}deg` } as CSSProperties}><Art src={friendSrc(char)} emoji={waitFriends[char].emoji} /></i>)}</div>
        <div className="snap-grid">{[0, 1, 2, 3, 4, 5].map(slot => {
            const pop = finale ? { id: -slot - 1, slot, char: characters[slot % characters.length], born: 0 } : up.find(p => p.slot === slot);
            return <div key={slot} className="snap-window">
                {pop && <button type="button" key={pop.id} className="snap-friend" aria-label={`抓拍${waitFriends[pop.char].name}`} data-demo={slot === up[0]?.slot ? '' : undefined} onPointerDown={() => snap(pop)}><Art src={friendSrc(pop.char)} emoji={waitFriends[pop.char].emoji} /></button>}
                {flash?.slot === slot && <span key={flash.key} className="snap-flash" aria-hidden="true">咔嚓！</span>}
            </div>;
        })}</div>
        {finale && <p className="game-finale" aria-hidden="true">拍到啦！</p>}
    </div>;
}
