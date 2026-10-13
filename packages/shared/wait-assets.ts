/**
 * Illustrated art for the generation wait, served from assets/wait/ as WebP (drawn as PNG by Codex, see docs/Codex-等待页素材生图任务.md;
 * the PNG masters stay out of git in tmp/wait-assets-png/).
 * Every piece has an emoji fallback so the page still works while a file is missing.
 */
export const waitStickers = {
    heart: { name: '爱心', emoji: '💖' },
    hearts: { name: '双心', emoji: '💕' },
    rose: { name: '玫瑰', emoji: '🌹' },
    ring: { name: '戒指', emoji: '💍' },
    sparkle: { name: '闪光', emoji: '✨' },
    bow: { name: '蝴蝶结', emoji: '🎀' },
    toast: { name: '干杯', emoji: '🥂' },
    blossom: { name: '樱花', emoji: '🌸' },
    crown: { name: '皇冠', emoji: '👑' },
    loveletter: { name: '情书', emoji: '💌' },
    cake: { name: '蛋糕', emoji: '🎂' },
    balloons: { name: '气球', emoji: '🎈' },
    popper: { name: '礼花', emoji: '🎉' },
    partyhat: { name: '派对帽', emoji: '🥳' },
    gift: { name: '礼物', emoji: '🎁' },
    star: { name: '星星', emoji: '⭐' },
    cupcake: { name: '小蛋糕', emoji: '🧁' },
    confetti: { name: '彩带', emoji: '🎊' },
    sunglasses: { name: '墨镜', emoji: '😎' },
    butterfly: { name: '蝴蝶', emoji: '🦋' },
    rainbow: { name: '彩虹', emoji: '🌈' },
    shootingstar: { name: '流星', emoji: '💫' },
    clover: { name: '四叶草', emoji: '🍀' },
    dino: { name: '小恐龙', emoji: '🦖' },
    rocket: { name: '火箭', emoji: '🚀' },
    unicorn: { name: '独角兽', emoji: '🦄' },
    whale: { name: '小鲸鱼', emoji: '🐳' },
    lollipop: { name: '棒棒糖', emoji: '🍭' },
} as const;
export type WaitStickerId = keyof typeof waitStickers;
export const stickerSrc = (id: WaitStickerId) => `/wait/stickers/${id}.webp`;

export const waitFriends = {
    'adventure-dino': { name: '小恐龙', emoji: '🦖' },
    'adventure-astronaut': { name: '小宇航员', emoji: '👩‍🚀' },
    'adventure-dragon': { name: '小飞龙', emoji: '🐲' },
    'adventure-unicorn': { name: '独角兽', emoji: '🦄' },
    'adventure-whale': { name: '小鲸鱼', emoji: '🐳' },
    'adventure-fairy': { name: '小精灵', emoji: '🧚' },
    'career-firetruck': { name: '消防车', emoji: '🚒' },
    'career-plane': { name: '小飞机', emoji: '✈️' },
    'career-scientist': { name: '小科学家', emoji: '🧪' },
    'career-police': { name: '警车', emoji: '🚓' },
    'career-doctor': { name: '小医生', emoji: '🩺' },
    'career-train': { name: '小火车', emoji: '🚂' },
    'animal-cat': { name: '小猫', emoji: '🐱' },
    'animal-dog': { name: '小狗', emoji: '🐶' },
    'animal-rabbit': { name: '小兔', emoji: '🐰' },
    'animal-panda': { name: '熊猫', emoji: '🐼' },
    'animal-fox': { name: '小狐狸', emoji: '🦊' },
    'animal-penguin': { name: '企鹅', emoji: '🐧' },
} as const;
export type WaitFriendId = keyof typeof waitFriends;
export const friendSrc = (id: WaitFriendId) => `/wait/friends/${id}.webp`;

export const waitArt = {
    studio: '/wait/studio.webp',
    fortuneTube: '/wait/fortune-tube.webp',
    cardBack: '/wait/card-back.webp',
    fortune: { general: '/wait/fortune-general.webp', together: '/wait/fortune-together.webp', celebration: '/wait/fortune-celebration.webp' },
} as const;

/** Memory-game card faces: auspicious words in a modern 古风 style, each with its own colour so pairs read at a glance. */
export const waitLots = {
    daji: { name: '大吉' }, zhongji: { name: '中吉' }, xiaoji: { name: '小吉' }, shangji: { name: '上吉' },
    shangshang: { name: '上上签' }, jixing: { name: '吉星' }, ruyi: { name: '如意' }, shunsui: { name: '顺遂' },
} as const;
export type WaitLotId = keyof typeof waitLots;
export const lotSrc = (id: WaitLotId) => `/wait/lots/${id}.webp`;
/** Each fortune slip is one illustration with its words drawn in (see docs/Codex-签文与签牌生图任务.md). */
export const fortuneSrc = (id: string) => `/wait/fortunes/${id}.webp`;
