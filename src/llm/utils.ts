// ──────────────────────────────────────────────────────────────────────────────
// llm/utils.ts
//
//  Small helpers: stable JSON stringify, sha1, and deterministic journey IDs.
//  These utilities are intentionally dependency-free and pure.
// ──────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';

/**
 * Deterministic JSON stringify:
 * - Sorts plain object keys recursively to ensure stable hashes across runs.
 * - Leaves arrays as-is (preserves order).
 * - Does not special-case Map/Set/Date; callers should normalize first if needed.
 */
export function stableStringify(value: any): string {
    // Sort object keys for stable hashing.
    return JSON.stringify(value, (_k, v) => {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            return Object.keys(v)
                .sort()
                .reduce((acc, k) => {
                    acc[k] = v[k];
                    return acc;
                }, {} as Record<string, unknown>);
        }
        return v;
    });
}

/** Hex-encoded SHA-1 of a UTF-8 string. Suitable for non-cryptographic IDs. */
export function sha1Hex(input: string): string {
    return crypto.createHash('sha1').update(input, 'utf8').digest('hex');
}

/**
 * Human-readable deterministic ID for a journey, derived from a root scope and
 * a steps signature. Prefixed to make scanning logs easier.
 *
 * Example: "J-3fa4b2c9e01a"
 */
export function deterministicJourneyId(rootRouteOrModule: string, stepsSignature: string): string {
    return `J-${sha1Hex(`${rootRouteOrModule}#${stepsSignature}`).slice(0, 12)}`;
}

/**
 * Compact signature for journey steps that is stable and diff-friendly.
 * We intentionally ignore incidental properties; only (type, id, via) matter.
 *
 * Example element shape:
 *   { stepType: "interaction", nodeId: "/home", via: "click" }
 */
export function journeyStepsSignature(steps: Array<{ stepType: string; nodeId: string; via?: string }>): string {
    return steps
        .map(s => `${s.stepType}:${s.nodeId}${s.via ? `@${s.via}` : ''}`)
        .join('→');
}