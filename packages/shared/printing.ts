export interface PrinterOption {
    name: string;
    label: string;
    choices: { value: string; label: string }[];
}
export interface PrinterSettings {
    enabled: boolean;
    queue?: string;
    paper?: string;
    media?: string;
    quality?: string;
    copies?: number;
    fit?: 'contain' | 'cover';
    paperConfirmed?: boolean;
}
export interface PrintJob {
    id: string;
    sessionId: string;
    imageId: string;
    status: 'preparing' | 'submitting' | 'submitted' | 'failed' | 'unknown';
    createdAt: number;
    queue?: string;
    copies?: number;
    cupsId?: string;
    error?: string;
}
