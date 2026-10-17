/** Every visit takes exactly one photo, so there is no count to choose. Staff may set its price in the back office;
 *  it is required once the machine takes payment, otherwise it is display-only. */
export interface PhotoPackage { count: number; price?: number; }
export const photosPerVisit = 1;
export const visitPackage = (price?: number): PhotoPackage => price === undefined ? { count: photosPerVisit } : { count: photosPerVisit, price };

/** About 40 s to generate one photo, plus roughly as long again to pick a theme and take the shot. */
export const secondsPerPhoto = 40 + 40;
export const packageMinutes = (count: number) => Math.ceil(count * secondsPerPhoto / 60);

export const priceText = (price: number) => `¥${Number.isInteger(price) ? price : price.toFixed(2)}`;

/** A price is optional; when set it is 0–9999 yuan with at most two decimals. */
export const validPrice = (price: unknown): price is number | undefined =>
    price === undefined || (typeof price === 'number' && Number.isFinite(price) && price >= 0 && price <= 9999 && Math.round(price * 100) === price * 100);

/** One line for the home screen: the price once staff have set it, otherwise nothing. */
export const packageSummary = (item?: PhotoPackage) => item?.price === undefined ? '' : `${priceText(item.price)} / 次`;
