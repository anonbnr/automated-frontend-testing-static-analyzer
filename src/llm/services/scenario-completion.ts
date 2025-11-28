// ──────────────────────────────────────────────────────────────────────────────
// llm/services/journeys-refiner.service.ts
//
//  JourneysRefinerService
//  ----------------------
//  Core logic behind POST /llm/journeys/refine.
//  Responsibilities:
//   • Validate request (Zod) — strict on requireds, forward-compatible on meta.
//   • Build a compact prompt with an explicit index of legal node IDs.
//   • Call provider.complete({ json:true }) with time/token clamps from env.
//   • Normalize/stabilize LLM output:
//       - deterministic IDs for any LLM-touched items,
//       - enforce source:"llm" on LLM-touched items,
//       - compute finalJourneys.
//   • Gentle one-shot retry if the proposal is effectively a no-op.
//   • Structured logging throughout (start/size/retry/end).
//
//  Design notes:
//   • No state kept on the instance; method is referentially transparent
//     given (reqBody, requestId, env, provider).
//   • Provider-agnostic: only expects `.complete({ ... })` and `.name`.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
 * !! THIS IS A WORK IN PROGRESS !!
 *  - The actual prompt does not give a valid and stable response
 *  - It'l need more ajustement
 *  - In addition to that, we'l need to add a parser of the llm's response to a
 *    a scenario's StepsData[] type
 * !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! 
 */

import { env } from '../../api/env.js';
import { UserJourney } from '../../models/user-journeys/user-journey-info.js';
import { makeLlmProvider } from '../factory.js';

// ──────────────────────────────────────────────────────────────────────────────
// Lightweight local types
// ──────────────────────────────────────────────────────────────────────────────

/** Try parse JSON; return undefined on failure (never throws). */
function safeParseJson(s: string) {
    try {
        return JSON.parse(s);
    } catch {
        return undefined;
    }
}

/** Construct the **system** prompt (policy + constraints). */
function buildSystemPrompt(): string {
    return [
        'You are in a context of fonctional testing for angular graphical user interface.',
        'You have to complete scenarios to attach values to each scenarioStep.',
        '',
        'Here is a json of expandedSteps of userJourney',
        'A userJourney represents a path in an angular application which leads to something, like creating a user, liking a post, or anything else a users can do on the application via a browser',
        'userJourney\'s expandedSteps a range of action selenium is going to execute',
        'some of those actions involve a user\'s input like filling a textarea or or anything that needs user`s decision',
        '',
        'I want you to produce an array with only the value to be inserted as string for each expandedStep.',
        'Each array\'s element match the action of the expandedSteps array at the same index.',
        'It means the array match the lenght of the userJourney\'s expandedSteps and a string with a value is relatable to the action at the same index of the expandedSteps',
        'The output must be a json, with the two arrays, with successScenario and errorScenario keys',
        '',
        'Output JSON ONLY with EXACT keys:',
        '{ "successScenario": string[], "errorScenario": string[]}',
    ].join('\n');
}

/** A tiny few-shot that showcases merge + intent-rename + no hallucinations. */
function buildFewShot(): string {
    const str = `
    ## Here's an exemple of a userJourney adding a new user
    {
        "successScenario": [
            "",
            "",
            "",
            "Alice",
            "Johnson",
            "female",
            "alice@example.com",
            "StrongP@ssw0rd",
            "1990-06-15",
            "+33123456789",
            "France",
            "I love Angular testing.",
            "42",
            "#ff9900",
            "high",
            "yes",
            "avatar.jpg",
            "true",
            ""
        ],
        "errorScenario": [
            "",
            "",
            "",
            "",
            "",
            "",
            "not-an-email",
            "123",
            "2035-01-01",
            "abcde",
            "",
            "",
            "-1",
            "notacolor",
            "",
            "",
            "",
            "",
            ""
        ]
    }`
    
    return str;
}

/** Join few-shot + INPUT + OUTPUT directive into the final prompt. */
function buildFullPrompt(userJourneyId: string, fewShot: string, inputJson: string): string {
    return [
        // fewShot,
        '### UserJourneyId: ' + userJourneyId,
        '### INPUT JSON',
        inputJson,
        '',
        '### OUTPUT',
        'Return valid JSON with keys: successScenario, errorScenario. No comments or extra keys.',
    ].join('\n');
}

// ──────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────-

export async function completion(userJourey: UserJourney) {

        // 2) Provider selection + availability check
        const provider = makeLlmProvider();
        if (!provider || !provider.isConfigured()) {
            const err = new Error('LLM provider not available/configured');
            (err as any).code = 'LLM_UNAVAILABLE';
            throw err;
        }
        
        const userJourneyId: string = userJourey.id;
        const expandedSteps = userJourey.expandedSteps;

        // 4) Prompt assembly (no secrets; explicit legal node index).
        const system = buildSystemPrompt();
        const fewShot = buildFewShot();
        const userPayload = JSON.stringify(expandedSteps);
        const prompt = buildFullPrompt(userJourneyId, fewShot, userPayload);

        // 5) LLM call (token/time clamps from env).
        const maxTokens = Math.min(10_000, env.llm.openai.maxTokens);
        const timeoutMs = env.llm.openai.timeoutMs;
        console.log("System: " + system);
        console.log("Prompt: " + prompt);

        const raw = await provider.complete({
            system,
            prompt,
            json: true,
            maxTokens,
            timeoutMs,
            temperature: 0, // deterministic as much as feasible
        });

        console.table(raw);

        // Provider may return text; prefer raw.json, otherwise parse text.
        // const candidate = (raw.json ?? (raw.text ? safeParseJson(raw.text) : null)) || {};

        return raw;
}
