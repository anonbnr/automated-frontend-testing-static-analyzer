// builders/user-journeys/intent-resolver.ts
/**
 * intent-resolver
 * ---------------
 * Resolves a route path to a concise human label for UI bucketing.
 * Strategy: prefer `data.title`, then resolve redirects, else title-case tail.
 */
import { RouteMap } from "../../models/route-info.js";

/**
 * Converts a route path ("/posts", "/users/:id", …) into a human-friendly label.
 * The intent is used to bucket user journeys in the UI.
 */
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
 * Default resolver strategy:
 * 1) If a ComponentRoute has data.title → use it
 * 2) Else, if a RedirectRoute exists → follow it (with loop protection) and resolve
 * 3) Else, Title-Case of the last segment
 *
 * Notes:
 * - Accepts paths with or without leading slash
 * - Collapses repeated slashes and decodes URI segments
 * - Treats "" or "/" as the root label (defaults to "Home")
 * - Treats "**" as wildcard (defaults to "Not Found")
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
     * - Compares using normalized paths on BOTH the query and route-map entries.
     * - Follows redirects up to 12 hops with loop protection.
     * - Special-cases "/" and "**".
     */
    resolve(route: string): string {
        // a) normalize
        const key = this.normalize(route);

        // b) cache
        const cached = this.cache.get(key);
        if (cached) return cached;

        // explicit root/wildcard handling
        if (key === "/") return this.memo(key, this.opts.rootLabel);
        if (this.isWildcard(key)) return this.memo(key, this.opts.wildcardLabel);

        // handling param tails
        if (/\/:[^/]+$/.test(key)) {
            const parts = key.split("/").filter(Boolean);
            const base = parts.length >= 2 ? parts[parts.length - 2] : "";
            const label = this.titleCase(base) || "Item";
            return this.memo(key, `${label} Profile`); // or "Details"
        }

        // 1) direct component route
        const comp = this.routeMap.routes.find(r => this.normalize(r.route) === key);
        if (comp)
            return this.memo(
                key,
                (comp.data?.title?.trim()) ??
                this.titleCase(this.tailSegment(key)) ??
                this.opts.unknownLabel
            );

        // 2) follow redirect chain (with loop protection)
        const maxHops = 12, seen = new Set<string>([key]);
        let hops = 0, cursor: string | undefined = key;

        while (hops++ < maxHops && cursor) {
            const redir = this.routeMap.redirections.find(r => this.normalize(r.route) === cursor);
            if (!redir) break;

            const next = this.normalize(redir.redirectTo);
            if (seen.has(next)) break; // loop guard
            seen.add(next);

            const comp2 = this.routeMap.routes.find(r => this.normalize(r.route) === next);
            if (comp2)
                return this.memo(
                    key,
                    (comp2.data?.title?.trim()) ??
                    this.titleCase(this.tailSegment(next)) ??
                    this.opts.unknownLabel
                );

            if (next === "/") return this.memo(key, this.opts.rootLabel);
            if (this.isWildcard(next)) return this.memo(key, this.opts.wildcardLabel);

            cursor = next;
        }

        return this.memo(
            key,
            this.titleCase(this.tailSegment(key)) ??
            this.opts.unknownLabel
        );
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