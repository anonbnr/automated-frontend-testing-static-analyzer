import z from "zod";

export const scenarioSchemaPost = z.object({
        name: z.string().min(5),
        description: z.string().min(5).optional(),
});

const editedByEnum = z.enum(['analyzer', 'llm', 'user']);
const statusEnum = z.enum(['draft', 'ready', 'deprecated']);

const stepsData = z.object({
        value: z.string().min(5).optional(),
        usersNote: z.string().min(5).optional()
})

export const scenarioSchemaPatch = z.object({
        name: z.string().min(5).optional(),
        description: z.string().min(5).optional(),
        editedBy: editedByEnum.optional(),
        tags: z.array(z.string()).optional(),
        status: statusEnum.optional(),
        stepsData: z.array(stepsData).optional(),
});
