/** Photo packages: before a visit the customer picks how many photos to take; each one may use a different theme.
 *  Payment happens off the machine, so prices are display-only and optional — staff set them in the back office. */
export interface PhotoPackage { count: number; price?: number; }
export const defaultPackages: PhotoPackage[] = [{ count: 4 }, { count: 5 }, { count: 6 }];
export const maxPackages = 4, maxPhotosPerPackage = 12;

/** About 40 s to generate one photo, plus roughly as long again to pick a theme and take the shot. */
export const secondsPerPhoto = 40 + 40;
export const packageMinutes = (count: number) => Math.ceil(count * secondsPerPhoto / 60);

export const priceText = (price: number) => `¥${Number.isInteger(price) ? price : price.toFixed(2)}`;

export function validPackages(value: unknown): value is PhotoPackage[] {
    if (!Array.isArray(value) || value.length > maxPackages) return false;
    const counts = new Set<number>();
    for (const item of value) {
        if (!item || typeof item !== 'object') return false;
        const { count, price } = item as Record<string, unknown>;
        if (!Number.isInteger(count) || (count as number) < 1 || (count as number) > maxPhotosPerPackage || counts.has(count as number)) return false;
        if (price !== undefined && (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 9999 || Math.round(price * 100) !== price * 100)) return false;
        counts.add(count as number);
    }
    return true;
}

/** Stored and shown smallest first; only `count` and `price` survive. */
export const normalizePackages = (items: PhotoPackage[]): PhotoPackage[] =>
    [...items].sort((a, b) => a.count - b.count).map(({ count, price }) => price === undefined ? { count } : { count, price });

/** One line for the home screen, e.g. "可选 4–6 张 · 约 6–8 分钟 · ¥39 起". */
export function packageSummary(items: PhotoPackage[]) {
    if (!items.length) return '';
    const sorted = normalizePackages(items), first = sorted[0], last = sorted[sorted.length - 1];
    const range = (a: number | string, b: number | string) => a === b ? `${a}` : `${a}–${b}`;
    const prices = sorted.flatMap(item => item.price === undefined ? [] : [item.price]);
    return [`可选 ${range(first.count, last.count)} 张`, `约 ${range(packageMinutes(first.count), packageMinutes(last.count))} 分钟`, ...(prices.length ? [`${priceText(Math.min(...prices))}${prices.length > 1 && new Set(prices).size > 1 ? ' 起' : ''}`] : [])].join(' · ');
}
