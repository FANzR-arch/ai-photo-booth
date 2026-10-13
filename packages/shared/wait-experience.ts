import { photoCategoryFor, type PhotoCategory } from './photo-categories';
import type { FortuneSet } from './fortunes';
import type { WaitFriendId, WaitStickerId } from './wait-assets';

/** The generation wait, minute by minute. Times are measured from "开始生成"; real Seedream runs mostly take 22–38 s. */
export const waitTiming = {
    introMs: 1500,
    fortuneOfferMs: 4000,
    fortuneShowMs: 3000,
    demoIdleMs: 10000,
    framesAtMs: 45000,
    framesShowMs: 8000,
    switchAtMs: 60000,
    finaleMs: 1000,
    flipMs: 700,
    developMs: 2500,
    compareMs: 1500,
} as const;
export const revealMs = waitTiming.flipMs + waitTiming.developMs + waitTiming.compareMs;

export type WaitGame = 'bubbles' | 'stickers' | 'memory' | 'snap';
export type WaitAudience = 'kids' | 'together' | 'celebration' | 'general';
export const waitGameNames: Record<WaitGame, string> = { bubbles: '戳泡泡', stickers: '贴贴纸', memory: '翻牌配对', snap: '抓拍' };
/** Order used by the "换个玩法" button. */
export const waitGameCycle: WaitGame[] = ['memory', 'bubbles', 'snap', 'stickers'];

export function waitAudience(styleId: string, subjectCount?: 1 | 2): WaitAudience {
    const category: PhotoCategory = photoCategoryFor(styleId);
    if (category === 'kids-adventure' || category === 'kids-career') return 'kids';
    if (category === 'together' || category === 'wedding' || subjectCount === 2) return 'together';
    if (category === 'celebration') return 'celebration';
    return 'general';
}

/** Default game, then the one it switches to after a minute. Stickers are never switched away (decorations would be lost). */
export const waitGames: Record<WaitAudience, [WaitGame, WaitGame]> = {
    kids: ['snap', 'bubbles'],
    together: ['stickers', 'memory'],
    celebration: ['stickers', 'bubbles'],
    general: ['memory', 'bubbles'],
};

/** Children cannot read a fortune slip, so they go straight to the game. */
export const fortuneSet = (audience: WaitAudience): FortuneSet | undefined => audience === 'kids' ? undefined : audience;

/** A plain description of what image generation does, not measured progress: the last stage holds until the photo is ready. */
const stages = [{ at: 0, label: '认出五官' }, { at: 4000, label: '设计造型' }, { at: 12000, label: '布光、上色' }, { at: 22000, label: '细节精修' }];
export const waitStages = stages.map(s => s.label);
export function stageAt(ms: number) {
    let index = 0;
    stages.forEach((s, i) => { if (ms >= s.at) index = i; });
    return { index, label: stages[index].label };
}

/** One calm line for slow runs; nothing before a minute. */
export function slowNotice(ms: number) {
    if (ms >= 120000) return '比平时久了一些，可以请工作人员帮忙看看';
    if (ms >= 90000) return '还在精修，再等一下下';
    if (ms >= 60000) return '今天画得慢一点，照片不会丢';
}

export const stickerSets: Record<WaitAudience, WaitStickerId[]> = {
    together: ['heart', 'hearts', 'rose', 'ring', 'sparkle', 'bow', 'toast', 'blossom', 'crown', 'loveletter'],
    celebration: ['cake', 'balloons', 'popper', 'partyhat', 'gift', 'sparkle', 'star', 'crown', 'cupcake', 'confetti'],
    general: ['blossom', 'star', 'sparkle', 'sunglasses', 'crown', 'butterfly', 'rainbow', 'shootingstar', 'clover', 'bow'],
    kids: ['dino', 'rocket', 'star', 'rainbow', 'unicorn', 'balloons', 'crown', 'whale', 'lollipop', 'butterfly'],
};
/** Where a tapped sticker lands, as fractions of the photo: around the person, never over the face in the middle. */
export const stickerSlots: [number, number][] = [[.5, .1], [.18, .2], [.82, .2], [.12, .52], [.88, .52], [.2, .86], [.8, .86], [.5, .93]];
export const maxStickers = stickerSlots.length;

export const bubbleSkins: Record<WaitAudience, WaitStickerId[]> = {
    general: ['star', 'sparkle', 'blossom', 'shootingstar'],
    together: ['heart', 'blossom', 'hearts', 'sparkle'],
    celebration: ['balloons', 'popper', 'gift', 'star'],
    kids: ['dino', 'whale', 'rocket', 'star'],
};

export function snapCharacters(styleId: string): WaitFriendId[] {
    const category = photoCategoryFor(styleId);
    if (category === 'kids-career') return ['career-firetruck', 'career-plane', 'career-scientist', 'career-police', 'career-doctor', 'career-train'];
    if (category === 'kids-adventure') return ['adventure-dino', 'adventure-astronaut', 'adventure-dragon', 'adventure-unicorn', 'adventure-whale', 'adventure-fairy'];
    return ['animal-cat', 'animal-dog', 'animal-rabbit', 'animal-panda', 'animal-fox', 'animal-penguin'];
}
