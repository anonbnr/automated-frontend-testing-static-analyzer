import z from "zod";

export const workflowScenarioSchemaPost = z.object({
    workflowId: z.number(),
    scenarioId: z.number(),
});

export const workflowScenarioSchemaPatch = z.object({
    order: z.number(),
});
