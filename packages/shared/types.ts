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
    /** How the process was started; demo launches stay locked in test mode. */
    mode: Mode;
    /** Generation used for new sessions, after the back-office simulated-generation switch. */
    generation: Mode;
    /** Show test-only entries such as the sample photo. Off in normal operation. */
    testMode: boolean;
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
export interface PickupData {
    expiresAt: number;
    mode: Mode;
    images: { id: string; downloadUrl: string }[];
    original?: { downloadUrl: string };
}
export interface TestSettings {
    testEntries: boolean;
    simulatedGeneration: boolean;
    /** True when the process was started in demo mode; switches cannot be turned off. */
    locked: boolean;
}
