import z from "zod";

export const scenarioSchemaPost = z.object({
        name: z.string().min(5),
        description: z.string().min(5).optional(),
});

// export const projectSchemaPatch = z.object({
//         name: z.string().min(5).optional(),
//         projectRoot: z.string().min(1).optional(),
//         description: z.string().min(1).optional(),
//         url: z.string().min(1).optional(),
// });
