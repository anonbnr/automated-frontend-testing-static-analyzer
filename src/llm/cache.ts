// ──────────────────────────────────────────────────────────────────────────────
// llm/cache.ts
//
//  Minimal in-memory TTL cache used by /llm/journeys/refine (and similar).
//  Keyed by (Idempotency-Key || hash(body)) plus provider+model combo.
//  Simple by design; swap to Redis later if needed.
// ──────────────────────────────────────────────────────────────────────────────

type CacheEntry<T> = { expiresAt: number; value: T };

export default class TtlCache<T> {
    private map = new Map<string, CacheEntry<T>>();

    constructor(private defaultTtlMs: number) { }

    /** Returns the cached value if present and not expired; prunes stale entries lazily. */
    get(key: string): T | undefined {
        const e = this.map.get(key);
        if (!e) return undefined;
        if (e.expiresAt < Date.now()) {
            this.map.delete(key);
            return undefined;
        }
        return e.value;
    }

    /** Stores a value with TTL (falls back to default TTL when not provided). */
    set(key: string, value: T, ttlMs?: number) {
        const expiresAt = Date.now() + (ttlMs ?? this.defaultTtlMs);
        this.map.set(key, { expiresAt, value });
    }

    /** Number of currently tracked entries (may include expired until touched). */
    size(): number {
        return this.map.size;
    }

    /** Explicitly remove one key. */
    delete(key: string): boolean {
        return this.map.delete(key);
    }

    /** Eagerly purge expired entries; useful in tests or before reporting metrics. */
    sweep(): number {
        const now = Date.now();
        let removed = 0;
        for (const [k, e] of this.map.entries()) {
            if (e.expiresAt < now) {
                this.map.delete(k);
                removed++;
            }
        }
        return removed;
    }
}