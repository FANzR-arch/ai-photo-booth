/** 上镜签：等待开场时抽一支，全部是好签（大吉、中吉、小吉、吉、上上签，不写凶）。每条签文对应一张插画 assets/wait/fortunes/{id}.webp，改签文要同时重画该图。文案可直接修改，id 一旦上线不要改动（会话里存的是 id）。 */
export type FortuneSet = 'general' | 'together' | 'celebration';
export interface Fortune { id: string; set: FortuneSet; level: string; text: string }

export const fortunes: Fortune[] = [
    { id: 'g1', set: 'general', level: '大吉', text: '今天的光，特别偏爱你' },
    { id: 'g2', set: 'general', level: '上上签', text: '镜头很懂你，放心交给它' },
    { id: 'g3', set: 'general', level: '中吉', text: '你笑起来的样子，值得多拍几张' },
    { id: 'g4', set: 'general', level: '吉', text: '今日宜：拍照、出门、被夸好看' },
    { id: 'g5', set: 'general', level: '上上签', text: '好看的人，连等待都很上镜' },
    { id: 'g6', set: 'general', level: '大吉', text: '这张照片，会被你存很久' },
    { id: 'g7', set: 'general', level: '小吉', text: '今天的你，比昨天更自在' },
    { id: 'g8', set: 'general', level: '中吉', text: '今日上镜指数：五颗星' },
    { id: 'g9', set: 'general', level: '大吉', text: '有些好看，是不用修的' },
    { id: 'g10', set: 'general', level: '吉', text: '今日宜：发朋友圈' },
    { id: 't1', set: 'together', level: '大吉', text: '你们俩今天很上镜' },
    { id: 't2', set: 'together', level: '上上签', text: '合照里笑得最开心的，是你们' },
    { id: 't3', set: 'together', level: '中吉', text: '今日宜：多拍一张，留给以后看' },
    { id: 't4', set: 'together', level: '吉', text: '两个人一起，连等待都变短了' },
    { id: 't5', set: 'together', level: '上上签', text: '默契满分，镜头都看出来了' },
    { id: 't6', set: 'together', level: '大吉', text: '这一刻，值得被好好收藏' },
    { id: 't7', set: 'together', level: '中吉', text: '今日宜：靠近一点，再笑一个' },
    { id: 't8', set: 'together', level: '上上签', text: '很配，不用解释' },
    { id: 'c1', set: 'celebration', level: '大吉', text: '今天值得被好好纪念' },
    { id: 'c2', set: 'celebration', level: '上上签', text: '新的开始，好运满格' },
    { id: 'c3', set: 'celebration', level: '中吉', text: '今日宜：许愿、庆祝、拍照' },
    { id: 'c4', set: 'celebration', level: '吉', text: '愿望会一个一个实现' },
    { id: 'c5', set: 'celebration', level: '上上签', text: '往后的日子，也要闪闪发光' },
    { id: 'c6', set: 'celebration', level: '大吉', text: '今天的主角，就是你' },
    { id: 'c7', set: 'celebration', level: '中吉', text: '把今天的笑容，存进照片里' },
    { id: 'c8', set: 'celebration', level: '上上签', text: '收到祝福一百条' },
];

export const fortuneById = (id: unknown) => typeof id === 'string' ? fortunes.find(f => f.id === id) : undefined;
export const isFortuneId = (id: unknown): id is string => !!fortuneById(id);
export function drawFortune(set: FortuneSet, random = Math.random) {
    const pool = fortunes.filter(f => f.set === set);
    return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}
