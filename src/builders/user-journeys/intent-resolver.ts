// ──────────────────────────────────────────────────────────────────────────────
// builders/user-journeys/intent-resolver.ts
//
//  intent-resolver
//  ---------------
//  Resolve internal route paths into concise, human-readable labels ("intent")
//  for UI bucketing. Prefers an explicit `data.title` from the route map,
//  otherwise follows redirects with loop protection, otherwise title-cases the
//  tail segment.
// ──────────────────────────────────────────────────────────────────────────────

import logger from "../../logging/logger.js";
import { RouteMap } from "../../models/route-info.js";

/** Strategy for turning a route ("/posts/:id") into a label ("Posts Profile"). */
export interface IntentResolver {
    resolve(route: string): string;
}

/** Optional knobs for the default resolver behavior. */
export interface IntentResolverOptions {
    /** Label for the root route "" or "/" (default: "Home"). */
    rootLabel?: string;
    /** Label when nothing useful can be inferred (default: "Other"). */
    unknownLabel?: string;
    /** Optional label for wildcard routes like "**" (default: "Not Found"). */
    wildcardLabel?: string;
}


/**
 * Default resolver:
 *   1) If a component route exists: use `data.title` if present; else title-case tail.
 *   2) Else, follow redirects (max 12 hops, loop-protected) and resolve as above.
 *   3) Else, title-case tail; root/wildcard handled explicitly.
 *
 * Normalization: accept inputs with/without a leading slash; collapse repeated slashes.
 */
export class DefaultIntentResolver implements IntentResolver {
    private cache = new Map<string, string>();
    private opts: Required<IntentResolverOptions>;

    constructor(private routeMap: RouteMap, opts: IntentResolverOptions = {}) {
        this.opts = {
            rootLabel: "Home",
            unknownLabel: "Other",
            wildcardLabel: "Not Found",
            ...opts,
        };
    }

    /**
    * Resolve a route path to a label. Results are memoized per normalized key.
    *
    * @param route Path like "/users/:id" or "users/:id".
    */
    resolve(route: string): string {
        // Normalize
        const key = this.normalize(route);

        // Cache hit?
        const cached = this.cache.get(key);
        if (cached) {
            logger.log("trace", "[IntentResolver] cache hit: %s -> %s", key, cached);
            return cached;
        }

        // Root & wildcard special-cases
        if (key === "/") return this.memo(key, this.opts.rootLabel);
        if (this.isWildcard(key)) return this.memo(key, this.opts.wildcardLabel);

        // Param tail heuristic: "/users/:id" → "Users Profile" (or "Item Profile")
        if (/\/:[^/]+$/.test(key)) {
            const parts = key.split("/").filter(Boolean);
            const base = parts.length >= 2 ? parts[parts.length - 2] : "";
            const label = this.titleCase(base) || "Item";
            return this.memo(key, `${label} Profile`); // or "Details"
        }

        // 1) Direct component route
        const comp = this.routeMap.routes.find(r => this.normalize(r.route) === key);
        if (comp) {
            const label =
                comp.data?.title?.trim() ??
                this.titleCase(this.tailSegment(key)) ??
                this.opts.unknownLabel;

            logger.log(
                "trace",
                "[IntentResolver] direct: route=%s title=%s -> %s",
                key,
                comp.data?.title,
                label
            );
            return this.memo(key, label);
        }

        // 2) Follow redirect chain
        const maxHops = 12, seen = new Set<string>([key]);
        let hops = 0, cursor: string | undefined = key;

        while (hops++ < maxHops && cursor) {
            const redir = this.routeMap.redirections.find(r => this.normalize(r.route) === cursor);
            if (!redir) break;

            const next = this.normalize(redir.redirectTo);
            if (seen.has(next)) {
                logger.debug(
                    "[IntentResolver] redirect loop detected: %s -> %s (stopping)",
                    cursor,
                    next
                );
                break;
            }
            seen.add(next);

            const comp2 = this.routeMap.routes.find(r => this.normalize(r.route) === next);
            if (comp2) {
                const label =
                    comp2.data?.title?.trim() ??
                    this.titleCase(this.tailSegment(next)) ??
                    this.opts.unknownLabel;

                logger.log(
                    "trace",
                    "[IntentResolver] redirect: %s -> %s -> %s",
                    key,
                    next,
                    label
                );
                return this.memo(key, label);
            }

            if (next === "/") return this.memo(key, this.opts.rootLabel);
            if (this.isWildcard(next)) return this.memo(key, this.opts.wildcardLabel);

            cursor = next;
        }

        // 3) Fallback: title-case tail or "Other"
        const fallback =
            this.titleCase(this.tailSegment(key)) ?? this.opts.unknownLabel;
        logger.log("trace", "[IntentResolver] fallback: %s -> %s", key, fallback);
        return this.memo(key, fallback);
    }

    /** Cache and return the resolved label for a normalized key. */
    private memo(k: string, v: string) {
        this.cache.set(k, v);
        return v;
    }

    /** Normalize: ensure exactly one leading slash, collapse multiples; "" → "/". */
    private normalize(p: string): string {
        const s = (p?.startsWith("/") ? p : `/${p ?? ""}`) || "/";
        const collapsed = s.replace(/\/{2,}/g, "/");
        return collapsed === "" ? "/" : collapsed;
    }

    /** Last non-empty segment of a path ("/users/42" → "42"; "/" → ""). Decodes URI. */
    private tailSegment(p: string): string {
        const parts = p.split("/").filter(Boolean);
        return parts.length ? decodeURIComponent(parts[parts.length - 1]) : "";
    }

    /** Wildcard matcher for routes like "**" or "/**". */
    private isWildcard(p: string): boolean {
        return p === "/**" || p === "**";
    }

    /** Title-Case; strips leading ":" (":id" → "id"). Returns undefined for empty. */
    private titleCase(seg: string): string | undefined {
        if (!seg) return undefined;

        const clean = seg.startsWith(":") ? seg.slice(1) : seg;
        const out = clean
            .split("-")
            .filter(Boolean)
            .map(w => (w[0] ? w[0].toUpperCase() : "") + w.slice(1))
            .join(" ");
        return out || undefined;
    }
}