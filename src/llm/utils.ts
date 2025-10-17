// src/llm/utils.ts
// Small helpers: stable JSON stringify, sha1, deterministic journey id.

import crypto from 'node:crypto';

export function stableStringify(value: any): string {
    // Sort object keys for stable hashing.
    return JSON.stringify(value, (_k, v) => {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            return Object.keys(v).sort().reduce((acc, k) => {
                acc[k] = v[k];
                return acc;
            }, {} as any);
        }
        return v;
    });
}

export function sha1Hex(input: string): string {
    return crypto.createHash('sha1').update(input, 'utf8').digest('hex');
}

export function deterministicJourneyId(rootRouteOrModule: string, stepsSignature: string): string {
    // "J-" + 8 hex for easier reading but still collision-safe for our scale
    return `J-${sha1Hex(`${rootRouteOrModule}#${stepsSignature}`).slice(0, 12)}`;
}

export function journeyStepsSignature(steps: Array<{ stepType: string; nodeId: string; via?: string }>): string {
    // keep signature independent of incidental properties; include via if present
    return steps.map(s => `${s.stepType}:${s.nodeId}${s.via ? `@${s.via}` : ''}`).join('→');
}
