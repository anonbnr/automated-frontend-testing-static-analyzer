// ──────────────────────────────────────────────────────────────────────────────
// models/screenshot-info.ts
//
// Screenshot metadata for route-level captures.
// Used by the screenshots API to report status and provide UI-renderable URLs.
// ──────────────────────────────────────────────────────────────────────────────

/** Lifecycle states for a requested screenshot. */
export type ScreenshotState = 'ready' | 'waiting' | 'capturing' | 'missing';

/**
 * Status for a single logical SPA route capture.
 *
 * • route    – canonical SPA path (e.g., "/new-post")
 * • id       – stable identifier (e.g., sha1(route))
 * • status   – current lifecycle state
 * • filename – absolute on-disk PNG path (useful for diagnostics)
 * • url      – public GET URL to render in the frontend (if available)
 */
export interface ScreenshotStatusItem {
    route: string;
    id: string;
    status: ScreenshotState;
    filename: string;
    url?: string;
}