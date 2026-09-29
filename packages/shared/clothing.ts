export const clothingModes = [
    { id: 'keep', name: '保留原服装', note: '保留衣服款式与配色' },
    { id: 'theme', name: '按主题换装', note: '根据所选主题搭配服装' },
] as const;
export type ClothingMode = typeof clothingModes[number]['id'];
export const isClothingMode = (value: unknown): value is ClothingMode => value === 'keep' || value === 'theme';
export const clothingLabel = (value?: ClothingMode) => clothingModes.find(item => item.id === value)?.name ?? clothingModes[0].name;
