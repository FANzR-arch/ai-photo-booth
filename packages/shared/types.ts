export type Mode = 'demo' | 'seedream';
export interface Style {
    id: string;
    name: string;
    description: string;
    prompt?: string;
    version: number;
    enabled: boolean;
    exampleUrl: string;
    size: string;
    color: string;
}
export interface Health {
    mode: Mode;
    configured: boolean;
    model: string;
    imageCount: number;
    pickupBaseUrl: string;
    lanUrls: string[];
}
export interface Session {
    id: string;
    styleId: string;
    styleName: string;
    status: 'created' | 'photographed' | 'generating' | 'ready' | 'partial' | 'failed' | 'unknown' | 'ended';
    mode: Mode;
    createdAt: number;
    expiresAt: number;
    images: {
        id: string;
        previewUrl: string;
    }[];
    error?: string;
    elapsedMs?: number;
    requestId?: string;
    promptVersion?: number;
    pickupUrl?: string;
}
export interface Order {
    id: string;
    sessionId: string;
    imageIds: string[];
    amount: number;
    status: 'pending' | 'paid' | 'failed' | 'cancelled';
    createdAt: number;
}
