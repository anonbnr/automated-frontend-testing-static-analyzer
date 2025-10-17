// src/llm/cache.ts
// Minimal in-memory TTL cache used by /llm/journeys/refine.
// Keyed by (Idempotency-Key || hash(body)) plus provider+model combination.
// We keep this simple; swap to Redis later if needed.

type CacheEntry<T> = { expiresAt: number; value: T };

export default class TtlCache<T> {
    private map = new Map<string, CacheEntry<T>>();

    constructor(private defaultTtlMs: number) { }

    get(key: string): T | undefined {
        const e = this.map.get(key);
        if (!e) return undefined;
        if (e.expiresAt < Date.now()) {
            this.map.delete(key);
            return undefined;
        }
        return e.value;
    }

    set(key: string, value: T, ttlMs?: number) {
        const expiresAt = Date.now() + (ttlMs ?? this.defaultTtlMs);
        this.map.set(key, { expiresAt, value });
    }

    size(): number {
        return this.map.size;
    }
}