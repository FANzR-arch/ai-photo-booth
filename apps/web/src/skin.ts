/** Visual skins: one page structure, a stylesheet per look. Chosen per device by staff; `?skin=` previews one without saving. */
const key = 'snap-skin';
export const skins = [
    { id: 'studio', name: '奶油珊瑚' },
    { id: 'memphis', name: '孟菲斯波普' },
] as const;
export type SkinId = typeof skins[number]['id'];
const known = (value: string | null): value is SkinId => skins.some(skin => skin.id === value);

export function selectedSkin(): SkinId {
    try {
        const preview = new URLSearchParams(location.search).get('skin');
        if (known(preview)) return preview;
        const saved = localStorage.getItem(key);
        return known(saved) ? saved : 'studio';
    } catch { return 'studio'; }
}
export function applySkin(id: SkinId = selectedSkin()) { document.documentElement.dataset.skin = id; }
export function saveSkin(id: SkinId) {
    try { localStorage.setItem(key, id); } catch { /* still applied for this page */ }
    applySkin(id);
}
