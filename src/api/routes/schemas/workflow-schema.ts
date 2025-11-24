import z from "zod";

export const workflowSchemaPost = z.object({
        name: z.string().min(5),
        description: z.string().min(5).optional(),
});

export const workflowSchemaPatch = z.object({
        name: z.string().min(5).optional(),
        description: z.string().min(5).optional(),
});
