import type { FrameId } from './frames';

const solo = '请家长退到画面外，孩子平视镜头、肩膀放松；头顶和双肩完整入镜。';
const family = '大人与孩子靠近一些，可以蹲下或抱起孩子，让每个人的脸都完整入镜、彼此不遮挡。';

/** Children's themes: gallery tab, capture guidance and paper pairing. Prompts live in config/styles/styles.json. */
export const kidsCollection: { id: string; category: 'kids-adventure' | 'kids-career'; realistic: boolean; frame: FrameId; guide: string }[] = [
  { id: 'kids-dino', category: 'kids-adventure', realistic: true, frame: 'sage', guide: solo },
  { id: 'kids-space', category: 'kids-adventure', realistic: true, frame: 'midnight', guide: solo },
  { id: 'kids-pirate', category: 'kids-adventure', realistic: true, frame: 'postcard', guide: solo },
  { id: 'kids-hero', category: 'kids-adventure', realistic: true, frame: 'terracotta', guide: solo },
  { id: 'kids-knight', category: 'kids-adventure', realistic: true, frame: 'gallery', guide: solo },
  { id: 'kids-castle', category: 'kids-adventure', realistic: true, frame: 'rose', guide: solo },
  { id: 'kids-fairy', category: 'kids-adventure', realistic: true, frame: 'sage', guide: solo },
  { id: 'kids-unicorn', category: 'kids-adventure', realistic: true, frame: 'rose', guide: solo },
  { id: 'kids-ocean', category: 'kids-adventure', realistic: true, frame: 'midnight', guide: solo },
  { id: 'kids-magic', category: 'kids-adventure', realistic: true, frame: 'ink', guide: solo },
  { id: 'kids-circus', category: 'kids-adventure', realistic: true, frame: 'ticket', guide: solo },
  { id: 'kids-snow', category: 'kids-adventure', realistic: true, frame: 'paper', guide: solo },
  { id: 'kids-candy', category: 'kids-adventure', realistic: true, frame: 'grid', guide: solo },
  { id: 'kids-camping', category: 'kids-adventure', realistic: true, frame: 'midnight', guide: solo },
  { id: 'kids-mecha', category: 'kids-adventure', realistic: true, frame: 'ink', guide: solo },
  { id: 'kids-panda', category: 'kids-adventure', realistic: true, frame: 'sage', guide: solo },
  { id: 'kids-picturebook', category: 'kids-adventure', realistic: false, frame: 'paper', guide: solo },
  { id: 'kids-toyfigure', category: 'kids-adventure', realistic: false, frame: 'gallery', guide: solo },
  { id: 'kids-crayon', category: 'kids-adventure', realistic: false, frame: 'paper', guide: solo },
  { id: 'kids-bricks', category: 'kids-adventure', realistic: false, frame: 'grid', guide: solo },
  { id: 'kids-family-space', category: 'kids-adventure', realistic: true, frame: 'midnight', guide: family },
  { id: 'kids-family-hero', category: 'kids-adventure', realistic: true, frame: 'terracotta', guide: family },
  { id: 'kids-family-bake', category: 'kids-adventure', realistic: true, frame: 'grid', guide: family },
  { id: 'kids-firefighter', category: 'kids-career', realistic: true, frame: 'terracotta', guide: solo },
  { id: 'kids-pilot', category: 'kids-career', realistic: true, frame: 'ticket', guide: solo },
  { id: 'kids-train', category: 'kids-career', realistic: true, frame: 'ticket', guide: solo },
  { id: 'kids-racer', category: 'kids-career', realistic: true, frame: 'film', guide: solo },
  { id: 'kids-scientist', category: 'kids-career', realistic: true, frame: 'paper', guide: solo },
  { id: 'kids-doctor', category: 'kids-career', realistic: true, frame: 'paper', guide: solo },
  { id: 'kids-vet', category: 'kids-career', realistic: true, frame: 'sage', guide: solo },
  { id: 'kids-bakery', category: 'kids-career', realistic: true, frame: 'rose', guide: solo },
  { id: 'kids-builder', category: 'kids-career', realistic: true, frame: 'ticket', guide: solo },
  { id: 'kids-detective', category: 'kids-career', realistic: true, frame: 'film', guide: solo },
  { id: 'kids-football', category: 'kids-career', realistic: true, frame: 'film', guide: solo },
  { id: 'kids-ballet', category: 'kids-career', realistic: true, frame: 'rose', guide: solo },
  { id: 'kids-painter', category: 'kids-career', realistic: true, frame: 'gallery', guide: solo },
  { id: 'kids-rockstar', category: 'kids-career', realistic: true, frame: 'ink', guide: solo },
  { id: 'kids-graduate', category: 'kids-career', realistic: true, frame: 'ticket', guide: solo },
];

export const isKidsTheme = (id: string) => kidsCollection.some(entry => entry.id === id);
export const kidsCategoryStyles = (category: 'kids-adventure' | 'kids-career') => kidsCollection.filter(entry => entry.category === category).map(entry => entry.id);
