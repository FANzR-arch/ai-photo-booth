import { portraitCollection } from './portrait-collection';
import { importedScenes } from './imported-scenes';
import { kidsCollection } from './kids-collection';
import type { FrameId } from './frames';

/** Legacy session purposes preserve saved sessions, capture guidance and frame defaults. Gallery navigation lives in photo-categories.ts. */
export const purposes = [
 { id: 'self', name: '好看的自己', note: '自然修饰，留下自己的样子', styles: [...importedScenes.filter(s=>s.purpose==='self').map(s=>s.id), 'business', 'editorial', 'cinema', ...portraitCollection.filter(s => s.purpose === 'self').map(s => s.id)] },
 { id: 'together', name: '和重要的人', note: '一起入镜，留下真实的亲密', styles: [...importedScenes.filter(s=>s.purpose==='together').map(s=>s.id), 'film', ...portraitCollection.filter(s => s.purpose === 'together').map(s => s.id)] },
 { id: 'memory', name: '留下今天', note: '一张照片，一句值得记住的话', styles: [...importedScenes.filter(s=>s.purpose==='memory').map(s=>s.id), 'festival', ...portraitCollection.filter(s => s.purpose === 'memory').map(s => s.id), ...kidsCollection.map(s => s.id)] },
 { id: 'creative', name: '玩点不一样', note: '艺术化演绎，人物细节可能变化', styles: [] },
] as const;
export type Purpose = typeof purposes[number]['id'];
const realistic = new Set(['natural','business','editorial','cinema','film','festival',...importedScenes.map(s=>s.id),...portraitCollection.map(s => s.id),...kidsCollection.filter(s => s.realistic).map(s => s.id)]);
export const isRealistic = (id: string) => realistic.has(id);
export function recommendedFrame(id: string, purpose?: Purpose): FrameId {
 if (importedScenes.some(s=>s.id===id)) return 'none';
 const pairing = portraitCollection.find(s => s.id === id);
 if (pairing) return pairing.frame;
 const kids = kidsCollection.find(s => s.id === id);
 if (kids) return kids.frame;
 if (purpose === 'memory' && id === 'natural') return 'ticket';
 if (purpose === 'together' && id === 'natural') return 'instant';
 return ({natural:'paper',business:'none',editorial:'gallery',cinema:'midnight',film:'film',festival:'rose'} as Record<string, FrameId>)[id] ?? 'paper';
}
export function captureGuide(id: string, together = false) {
 if (id === 'coming-of-age') return '使用一张清晰的单人照片，完整露出头顶与五官；海报会整理发型、调整姿势并换上深蓝服装。';
 const scene = importedScenes.find(s=>s.id===id);
 if (scene) return scene.people === 2 ? '请使用包含两位本人的清晰合照；左侧人物对应 A，右侧人物对应 B，动作按主题重新设计。' : '使用一张清晰的单人照片，完整露出五官与头顶；动作、布景和光线按主题重新设计，保留本人样貌。';
 const guidance = portraitCollection.find(s => s.id === id);
 if (guidance) return guidance.guide;
 const kids = kidsCollection.find(s => s.id === id);
 if (kids) return kids.guide;
 if (together) return '靠近一些，脸保持在相近距离；每个人都看得到镜头，彼此不要遮挡。';
 if (id === 'business' || id === 'editorial') return '身体可以微侧，脸朝镜头，肩膀放松；保持这个姿势拍摄。';
 return '平视镜头，肩膀放松，保持平时的表情；让头顶和双肩完整入镜。';
}
