export type Mode = 'demo' | 'seedream';
export interface Style {
    id: string;
    name: string;
    description: string;
    prompt?: string;
    outfitPrompt?: string;
    generationPreset?: 'coming-of-age' | 'directed-portrait';
    sceneOrientation?: import('./photo-orientation').PhotoOrientation;
    subjectCount?: 1 | 2;
    sourceCode?: string;
    version: number;
    enabled: boolean;
    exampleUrl: string;
    exampleUrls?: string[];
    size: string;
    color: string;
}
export interface Health {
    service?: 'snap-club';
    paymentMode: 'simulate';
    mode: Mode;
    configured: boolean;
    model: string;
    imageCount: number;
    pickupBaseUrl: string;
    lanUrls: string[];
}
export interface Session {
    purpose?: import('./portrait-experience').Purpose;
    orientation?: import('./photo-orientation').PhotoOrientation;
    clothingMode?: import('./clothing').ClothingMode;
    frame?: import('./frames').FrameId;
    caption?: import('./frames').Caption;
    id: string;
    styleId: string;
    styleName: string;
    status: 'created' | 'photographed' | 'generating' | 'ready' | 'partial' | 'failed' | 'unknown' | 'ended';
    mode: Mode;
    createdAt: number;
    expiresAt: number;
    completedAt?: number;
    deletedAt?: number;
    images: {
        id: string;
        previewUrl: string;
    }[];
    error?: string;
    elapsedMs?: number;
    requestId?: string;
    promptVersion?: number;
    pickupUrl?: string;
    originalUrl?: string;
}
export interface Order {
    id: string;
    sessionId: string;
    imageIds: string[];
    amount: number;
    status: 'pending' | 'paid' | 'failed' | 'cancelled';
    createdAt: number;
    paymentMode?: 'simulate';
}
