// api/routes/screenshots.ts
import { Request, Response, Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import logger from '../../logging/logger.js';
import { ScreenshotStatusItem } from '../../models/screenshot-info.js';
import { ScreenshotService } from '../../services/screenshot.service.js';
import { env } from '../env.js';

const router = Router();

/**
 * Screenshots Router
 *
 * Base path: /screenshots
 *
 * Conventions:
 *  - All endpoints are scoped by :analysisId
 *  - Body JSON for POST:
 *      {
 *        "routes": string[],
 *        "baseUrl"?: string   // optional override if your app isn’t at env.SCREENSHOTS_BASE_URL
 *      }
 *  - Public image URLs are served at:
 *      GET /screenshots/:analysisId/:route(*)
 *    …where :route is the logical SPA route (URL-encoded, no leading slash).
 */

// Storage root lives under the backend root (e.g., backend/.../data/screenshots)
const STORAGE_ROOT = env.SCREENSHOTS_STORAGE_ROOT;

// Service instance
const service = new ScreenshotService({
    storageRoot: STORAGE_ROOT,
    baseUrl: env.SCREENSHOTS_BASE_URL,
});

/** Normalize user-provided routes into an array of strings. */
function normalizeRoutes(bodyRoutes: unknown): string[] {
    const routes = Array.isArray(bodyRoutes) ? bodyRoutes : [];
    return routes.map(r => String(r));
}

function assertJourneyId(body: any): string | null {
    const id = typeof body?.journeyId === 'string' ? body.journeyId.trim() : '';
    return id || null;
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

/**
 * POST /screenshots/:analysisId/status
 *
 * Request:
 *  - params.analysisId: string
 *  - body.journeyId: string,
 *  - body.routes: string[] (logical SPA routes, e.g., ["/", "/new-post"])
 *
 * Response 200:
 *  {
 *    success: true,
 *    storageRoot: string,
 *    items: {
 *      [route: string]: ScreenshotStatusItem & { url: string }
 *    }
 *  }
 *
 * Response 4xx/5xx: { success: false, error: string }
 */
router.post('/:analysisId/status', async (req: Request, res: Response) => {
    const analysisId = String(req.params.analysisId || '').trim();
    const journeyId = assertJourneyId(req.body);
    const routes = normalizeRoutes(req.body?.routes);

    if (!analysisId) return res.status(400).json({ success: false, error: 'analysisId required' });
    if (!journeyId) return res.status(400).json({ success: false, error: 'journeyId required' });
    if (!routes.length) return res.status(400).json({ success: false, error: 'routes[] required' });

    try {
        const items = await service.status(analysisId, journeyId, routes);

        // Attach public URLs (GET endpoints) for convenience in the UI
        const withUrls: Record<string, ScreenshotStatusItem> = {};
        for (const it of items) {
            withUrls[it.route] = {
                ...it,
                url: `/screenshots/${encodeURIComponent(analysisId)}/${encodeURIComponent(journeyId)}/${encodeURIComponent(it.route.replace(/^\//, ''))}`
            };
        }

        res.json({ success: true, storageRoot: STORAGE_ROOT, items: withUrls });
    } catch (err: any) {
        logger.error('[POST /screenshots/%s/status] failed: %o', analysisId, err);
        res.status(500).json({ success: false, error: err.message || 'status failed' });
    }
});

/**
 * POST /screenshots/:analysisId/capture
 *
 * Triggers Puppeteer capture for given routes.
 *
 * Request:
 *  - params.analysisId: string
 *  - body.journeyId: string,
 *  - body.routes: string[]
 *  - body.baseUrl?: string (optional override if FE isn’t at env.SCREENSHOTS_BASE_URL)
 *
 * Responses:
 *  - 200 + { success: true, items: {...} } when capture completes (ready/waiting/capturing/missing)
 *  - 503 when the FE is not reachable, with a helpful "hint"
 *  - 4xx/5xx for other validation/errors
 */
router.post('/:analysisId/capture', async (req: Request, res: Response) => {
    const analysisId = String(req.params.analysisId || '').trim();
    const journeyId = assertJourneyId(req.body);
    const routes = normalizeRoutes(req.body?.routes);
    const baseUrl = typeof req.body?.baseUrl === 'string' ? req.body.baseUrl : undefined;

    if (!analysisId) return res.status(400).json({ success: false, error: 'analysisId required' });
    if (!journeyId) return res.status(400).json({ success: false, error: 'journeyId required' });
    if (!routes.length) return res.status(400).json({ success: false, error: 'routes[] required' });

    try {
        const finalStatuses = await service.capture(analysisId, journeyId, routes, baseUrl);

        const withUrls: Record<string, ScreenshotStatusItem> = {};
        for (const it of finalStatuses) {
            withUrls[it.route] = {
                ...it,
                url: `/screenshots/${encodeURIComponent(analysisId)}/${encodeURIComponent(journeyId)}/${encodeURIComponent(it.route.replace(/^\//, ''))}`
            };
        }

        res.json({ success: true, storageRoot: STORAGE_ROOT, items: withUrls });
    } catch (err: any) {
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
 */
router.get('/:analysisId/:journeyId/:route(*)', async (req: Request, res: Response) => {
    const analysisId = String(req.params.analysisId || '').trim();
    const journeyId = String(req.params.journeyId || '').trim();
    const raw = String(req.params.route || '');
    const logical = raw.startsWith('/') ? raw : `/${raw}`;

    const { createHash } = await import('node:crypto');
    const sha1 = (s: string) => createHash('sha1').update(s, 'utf8').digest('hex');

    const aidHash = sha1(analysisId);
    const jidHash = sha1(journeyId);
    const ridHash = sha1(logical);

    const file = path.join(STORAGE_ROOT, aidHash, jidHash, `${ridHash}.png`);

    try {
        await fs.access(file);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=60');
        return res.sendFile(file);
    } catch {
        return res.status(404).json({ success: false, error: 'Screenshot not found' });
    }
});

export default router;