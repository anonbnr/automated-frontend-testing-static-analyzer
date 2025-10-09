// services/screenshot.service.ts
import fetch from 'node-fetch';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';
import logger from '../logging/logger.js';
import { ScreenshotStatusItem } from '../models/screenshot-info.js';

export interface ScreenshotServiceOptions {
    /** Absolute path to storage root (e.g., /…/data/screenshots). */
    storageRoot: string;
    /** Base URL to visit, e.g. http://localhost:4200; derived from FRONTEND_PORT if omitted. */
    baseUrl?: string;
}

/**
 * ScreenshotService
 *
 * Responsibilities:
 *  - Keep per-analysis storage at <storageRoot>/<analysisId>/
 *  - Track per-route state via marker files:
 *      .pending   → "waiting"
 *      .capturing → "capturing"
 *      .png       → "ready"
 *      none       → "missing"
 *  - Drive Puppeteer to capture pages
 * 
 * NO AUTOSERVE:
 *  - This service does not attempt to start a dev server.
 *  - If the app is not reachable at baseUrl, `capture()` throws a descriptive error.
 *
 * Thread-safety:
 *  - Designed for single-instance use. If you’ll run multiple workers,
 *    gate `capture()` with an external queue/lock to avoid writing the same files concurrently.
 */
export class ScreenshotService {
    private readonly storageRoot: string;
    private readonly baseUrl: string;

    constructor(opts: ScreenshotServiceOptions) {
        this.storageRoot = opts.storageRoot;
        this.baseUrl = opts.baseUrl || 'http://localhost:4200';

        // logger.info('[ScreenshotService] storageRoot=%s, baseUrl=%s',
        //     this.storageRoot, this.baseUrl);
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Path & status helpers
    // ────────────────────────────────────────────────────────────────────────────
    /** Produce a stable id for a route (sha1 of normalized route). */
    private sha1(s: string): string {
        return createHash('sha1').update(s, 'utf8').digest('hex');
    }

    /** Ensure routes always start with '/'. */
    private normRoute(route: string): string {
        return route.startsWith('/') ? route : `/${route}`;
    }

    /** /data/screenshots/<sha1(analysisId)> */
    private analysisDir(analysisId: string): string {
        return path.join(this.storageRoot, this.sha1(analysisId));
    }

    /** /data/screenshots/<sha1(analysisId)>/<sha1(journeyId)> */
    private journeyDir(analysisId: string, journeyId: string): string {
        return path.join(this.analysisDir(analysisId), this.sha1(journeyId));
    }

    /** Absolute PNG path with .png extension (typed so puppeteer accepts it). */
    private pngPath(analysisId: string, journeyId: string, route: string): `${string}.png` {
        const id = this.sha1(this.normRoute(route));
        return path.join(this.journeyDir(analysisId, journeyId), `${id}.png`) as `${string}.png`;
    }

    /** Absolute marker file for "waiting". */
    private pendingPath(analysisId: string, journeyId: string, route: string): string {
        const id = this.sha1(this.normRoute(route));
        return path.join(this.journeyDir(analysisId, journeyId), `${id}.pending`);
    }

    /** Absolute marker file for "capturing". */
    private capturingPath(analysisId: string, journeyId: string, route: string): string {
        const id = this.sha1(this.normRoute(route));
        return path.join(this.journeyDir(analysisId, journeyId), `${id}.capturing`);
    }

    /** Ensure per-analysis directory exists. */
    private async ensureJourneyDir(analysisId: string, journeyId: string): Promise<void> {
        await fs.mkdir(this.journeyDir(analysisId, journeyId), { recursive: true });
    }

    /** Returns a single status record inferred from on-disk files. */
    private async statusOne(analysisId: string, journeyId: string, route: string): Promise<ScreenshotStatusItem> {
        const norm = this.normRoute(route);
        const id = this.sha1(norm);
        const file = this.pngPath(analysisId, journeyId, route);
        const pending = this.pendingPath(analysisId, journeyId, route);
        const capturing = this.capturingPath(analysisId, journeyId, route);

        if (existsSync(file)) return { route: norm, id, status: 'ready', filename: file };
        if (existsSync(capturing)) return { route: norm, id, status: 'capturing', filename: file };
        if (existsSync(pending)) return { route: norm, id, status: 'waiting', filename: file };
        return { route: norm, id, status: 'missing', filename: file };
    }

    // ───────────────── public API ─────────────────
    /**
    * Compute statuses for a batch of routes.
    * @param analysisId – analysis bucket
    * @param journeyId  journey bucket
    * @param routes – logical SPA routes (e.g., ["/", "/new-post"])
    */
    async status(analysisId: string, journeyId: string, routes: string[]): Promise<ScreenshotStatusItem[]> {
        await this.ensureJourneyDir(analysisId, journeyId);
        const items = await Promise.all(routes.map(r => this.statusOne(analysisId, journeyId, r)));
        return items;
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Capture (requires FE to already be running)
    // ────────────────────────────────────────────────────────────────────────────

    /**
     * Capture screenshots for given routes under the specified analysis.
     * Fails fast if FE at baseUrl is not reachable.
     *
     * @param analysisId  analysis bucket
     * @param journeyId  journey bucket
     * @param routes      logical SPA routes
     * @param baseUrl     optional override (e.g., http://localhost:5200)
     */
    async capture(analysisId: string, journeyId: string, routes: string[], baseUrl?: string): Promise<ScreenshotStatusItem[]> {
        if (!routes.length) return [];
        await this.ensureJourneyDir(analysisId, journeyId);

        const url = baseUrl || this.baseUrl;

        // 1) Require FE to be up (no autoserve)
        if (!(await this.isAppRunning(url))) {
            // Don’t create any markers; fail with a clear, actionable error.
            throw new Error(
                `Frontend not reachable at ${url}. ` +
                `Please start your test application (e.g., "npm start") and try again.`
            );
        }

        // 2) Seed ".pending" markers so status() can show progress
        await Promise.all(routes.map(async r => fs.writeFile(this.pendingPath(analysisId, journeyId, r), '')));

        // 3) Launch Puppeteer once, iterate routes
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
        });

        try {
            for (const route of routes) {
                const norm = this.normRoute(route);
                const png = this.pngPath(analysisId, journeyId, route);
                const pnd = this.pendingPath(analysisId, journeyId, route);
                const cap = this.capturingPath(analysisId, journeyId, route);

                try {
                    logger.info('[ScreenshotService] capturing analysis=%s route=%s', analysisId, norm);

                    // pending -> capturing
                    await fs.rm(pnd, { force: true }).catch(() => { });
                    await fs.writeFile(cap, '');

                    const page = await browser.newPage();
                    await page.setViewport({ width: 1920, height: 1080 });
                    await page.goto(`${url}${norm}`, { waitUntil: 'networkidle0', timeout: 30_000 });

                    // Stabilize visuals (avoid animations/spinners)
                    await page.addStyleTag({
                        content: `
                        * { animation-duration: 0s !important; animation-delay: 0s !important;
                            transition-duration: 0s !important; transition-delay: 0s !important; }
                            .mat-progress-bar, .mat-spinner { display: none !important; }
                        `
                    });

                    // brief grace period to settle layout
                    await new Promise(r => setTimeout(r, 800));
                    await page.screenshot({ path: png, fullPage: true, type: 'png' });
                    await page.close();

                    logger.info('[ScreenshotService] saved %s', png);
                } catch (err) {
                    logger.error('[ScreenshotService] capture failed route=%s: %o', norm, err);
                } finally {
                    await fs.rm(cap, { force: true }).catch(() => { });
                }
            }
        } finally {
            await browser.close();
        }

        // 4) Final statuses
        return this.status(analysisId, journeyId, routes);
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Reachability probe
    // ────────────────────────────────────────────────────────────────────────────

    /** Quick probe for FE readiness (HTTP 200-299 considered up). */
    private async isAppRunning(baseUrl: string): Promise<boolean> {
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 5_000);
            const res = await fetch(baseUrl, { signal: ctrl.signal });
            clearTimeout(t);
            return res.ok;
        } catch {
            return false;
        }
    }
}