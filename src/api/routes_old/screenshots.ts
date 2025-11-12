// ──────────────────────────────────────────────────────────────────────────────
// api/routes/screenshots.ts
//
// Screenshots Router
// ------------------
// Endpoints for querying status and capturing screenshots for SPA routes.
// Scoped under `/screenshots` and bucketed by :analysisId and :journeyId.
//
// Conventions
// • All write operations are idempotent with respect to markers; repeated calls
//   will re-check reachability and refresh statuses.
// • Public image URLs are deterministic and stable, derived from sha1 hashes.
//
// Security
// • This router exposes only file *reads* via GET; writes are confined to
//   the configured screenshots storage root. Inputs are normalized and never
//   used to traverse outside the storage root.
// ──────────────────────────────────────────────────────────────────────────────

import { Request, Response, Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import logger from '../../logging/logger.js';
import { ScreenshotStatusItem } from '../../models/screenshot-info.js';
import { ScreenshotService } from '../../services/screenshot.service.js';
import { env } from '../env.js';

/**
 * Base path: /screenshots
 *
 * Body contract for POST endpoints:
 * {
 *   "journeyId": string,
 *   "routes": string[],          // logical SPA routes ("/", "/new-post", …)
 *   "baseUrl"?: string           // optional override for capture
 * }
 */
const router = Router();

// Storage root lives under the backend root (e.g., backend/.../data/screenshots)
const STORAGE_ROOT = env.SCREENSHOTS_STORAGE_ROOT;

// Single service instance
const service = new ScreenshotService({
    storageRoot: STORAGE_ROOT,
    baseUrl: env.SCREENSHOTS_BASE_URL,
});

/** Normalize user-provided routes into an array of strings. */
function normalizeRoutes(bodyRoutes: unknown): string[] {
    const routes = Array.isArray(bodyRoutes) ? bodyRoutes : [];
    return routes.map(r => String(r));
}

/** Extract and validate journeyId from request body. */
function assertJourneyId(body: any): string | null {
    const id = typeof body?.journeyId === 'string' ? body.journeyId.trim() : '';
    return id || null;
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

/**
 * POST /screenshots/:analysisId/status
 *
 * Compute the current status for a set of routes (no capture).
 *
 * Request:
 *  - params.analysisId: string (bucket id)
 *  - body.journeyId: string
 *  - body.routes: string[] (logical SPA routes)
 *
 * Response 200:
 * {
 *   success: true,
 *   storageRoot: string,
 *   items: {
 *     [route: string]: ScreenshotStatusItem & { url: string }  // adds public GET URL
 *   }
 * }
 *
 * Errors:
 *  - 400: missing analysisId / journeyId / routes[]
 *  - 500: unexpected server error
 */
router.post('/:analysisId/status', async (req: Request, res: Response) => {
    // 1) Parse & normalize inputs
    const analysisId = String(req.params.analysisId || '').trim();
    const journeyId = assertJourneyId(req.body);
    const routes = normalizeRoutes(req.body?.routes);

    // 2) Validate required inputs (fail fast with clear messages)
    if (!analysisId) return res.status(400).json({ success: false, error: 'analysisId required' });
    if (!journeyId) return res.status(400).json({ success: false, error: 'journeyId required' });
    if (!routes.length) return res.status(400).json({ success: false, error: 'routes[] required' });

    try {
        // 3) Compute current statuses from marker files/PNGs (no side effects)
        const items = await service.status(analysisId, journeyId, routes);

        // 4) Attach deterministic public URLs so the UI can render images
        const withUrls: Record<string, ScreenshotStatusItem> = {};
        for (const it of items) {
            withUrls[it.route] = {
                ...it,
                // public GET endpoint to stream the PNG for this route
                url: `/screenshots/${encodeURIComponent(analysisId)}/${encodeURIComponent(journeyId)}/${encodeURIComponent(it.route.replace(/^\//, ''))}`
            };
        }

        // 5) Return status map keyed by logical route for convenient indexing
        res.json({ success: true, storageRoot: STORAGE_ROOT, items: withUrls });
    } catch (err: any) {
        // 6) Log full error, return generic message to client
        logger.error('[POST /screenshots/%s/status] failed: %o', analysisId, err);
        res.status(500).json({ success: false, error: err.message || 'status failed' });
    }
});

/**
 * POST /screenshots/:analysisId/capture
 *
 * Trigger Puppeteer capture for a set of routes.
 *
 * Request:
 *  - params.analysisId: string (bucket id)
 *  - body.journeyId: string
 *  - body.routes: string[]
 *  - body.baseUrl?: string (optional override if FE isn't at env.SCREENSHOTS_BASE_URL)
 *
 * Responses:
 *  - 200 OK: { success: true, storageRoot, items: {...} }  // includes per-route public URL
 *  - 503 Service Unavailable: FE not reachable at baseUrl (helpful hint included)
 *  - 4xx/5xx: validation/other errors
 */
router.post('/:analysisId/capture', async (req: Request, res: Response) => {
    // 1) Parse & normalize inputs
    const analysisId = String(req.params.analysisId || '').trim();
    const journeyId = assertJourneyId(req.body);
    const routes = normalizeRoutes(req.body?.routes);
    const baseUrl = typeof req.body?.baseUrl === 'string' ? req.body.baseUrl : undefined;

    // 2) Validate required inputs
    if (!analysisId) return res.status(400).json({ success: false, error: 'analysisId required' });
    if (!journeyId) return res.status(400).json({ success: false, error: 'journeyId required' });
    if (!routes.length) return res.status(400).json({ success: false, error: 'routes[] required' });

    try {
        // 3) Attempt capture (will fail fast with descriptive error if FE is down)
        const finalStatuses = await service.capture(analysisId, journeyId, routes, baseUrl);

        // 4) Attach deterministic public URLs for the newly captured (or attempted) routes
        const withUrls: Record<string, ScreenshotStatusItem> = {};
        for (const it of finalStatuses) {
            withUrls[it.route] = {
                ...it,
                url: `/screenshots/${encodeURIComponent(analysisId)}/${encodeURIComponent(journeyId)}/${encodeURIComponent(it.route.replace(/^\//, ''))}`
            };
        }

        // 5) Return final status snapshot (ready/waiting/capturing/missing)
        res.json({ success: true, storageRoot: STORAGE_ROOT, items: withUrls });
    } catch (err: any) {
        // 6) Map common reachability failure to 503 with a friendly hint
        const msg = String(err?.message || 'capture failed');
        const feDown = /Frontend not reachable/i.test(msg);

        logger.error('[POST /screenshots/%s/capture] failed: %o', analysisId, err);
        return res.status(feDown ? 503 : 500).json({
            success: false,
            error: msg,
            hint: feDown
                ? 'Start your test application (e.g., "npm start") at the indicated baseUrl, then retry.'
                : undefined,
        });
    }
});

/**
 * GET /screenshots/:analysisId/:journeyId/:route(*)
 *
 * Stream a PNG by deterministic sha1-based path.
 * (:route is URL-encoded and may contain slashes; we normalize it to start with '/')
 *
 * Responses:
 *  - 200 image/png  (with short cache header)
 *  - 404 JSON       { success: false, error: 'Screenshot not found' }
 */
router.get('/:analysisId/:journeyId/:route(*)', async (req: Request, res: Response) => {
    // 1) Extract and normalize params
    const analysisId = String(req.params.analysisId || '').trim();
    const journeyId = String(req.params.journeyId || '').trim();
    const raw = String(req.params.route || '');
    const logical = raw.startsWith('/') ? raw : `/${raw}`;

    // 2) Derive hashed storage path (keeps filenames stable, avoids unsafe chars)
    const { createHash } = await import('node:crypto');
    const sha1 = (s: string) => createHash('sha1').update(s, 'utf8').digest('hex');

    const aidHash = sha1(analysisId);
    const jidHash = sha1(journeyId);
    const ridHash = sha1(logical);

    const file = path.join(STORAGE_ROOT, aidHash, jidHash, `${ridHash}.png`);

    try {
        // 3) Ensure file exists, then stream with appropriate headers
        await fs.access(file);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=60');
        return res.sendFile(file);
    } catch {
        // 4) Graceful not-found
        return res.status(404).json({ success: false, error: 'Screenshot not found' });
    }
});

export default router;