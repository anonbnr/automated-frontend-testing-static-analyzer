// models/screenshot-info.ts
export type ScreenshotState = 'ready' | 'waiting' | 'capturing' | 'missing';

export interface ScreenshotStatusItem {
    route: string;         // logical SPA route (e.g., "/new-post")
    id: string;            // stable sha1(route)
    status: ScreenshotState;
    filename: string;      // absolute on-disk PNG path (for debugging)
    url?: string;          // public GET URL you can render in the UI
}