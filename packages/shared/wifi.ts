/** Venue Wi-Fi shown as a join QR on the delivery screen, so phones reach the LAN pickup page without typing. */
export const wifiSecurities = [
    { id: 'WPA', name: 'WPA/WPA2/WPA3' },
    { id: 'WEP', name: 'WEP（旧设备）' },
    { id: 'nopass', name: '无密码' },
] as const;
export type WifiSecurity = typeof wifiSecurities[number]['id'];
export interface WifiSettings { ssid: string; password: string; security: WifiSecurity; }
export const defaultWifiSettings: WifiSettings = { ssid: '', password: '', security: 'WPA' };

export function validWifi(value: unknown): value is WifiSettings {
    if (!value || typeof value !== 'object') return false;
    const { ssid, password, security } = value as Record<string, unknown>;
    if (typeof ssid !== 'string' || typeof password !== 'string' || !wifiSecurities.some(item => item.id === security)) return false;
    if (ssid.length > 32 || password.length > 63) return false;
    // An SSID is required only when the panel is in use; an empty SSID turns the QR off.
    return !ssid.trim() || security === 'nopass' || password.length >= (security === 'WPA' ? 8 : 5);
}

const escape = (text: string) => text.replace(/([\\;,:"])/g, '\\$1');
/** Standard `WIFI:` payload read by the iOS and Android camera apps. */
export function wifiQrText({ ssid, password, security }: WifiSettings): string {
    return `WIFI:T:${security};S:${escape(ssid)};${security === 'nopass' ? '' : `P:${escape(password)};`};`;
}
