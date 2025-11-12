import z from "zod";

export const projectSchemaPost = z.object({
        name: z.string().min(5),
        projectRoot: z.string().min(1),
        description: z.string().min(1).optional(),
        url: z.string().min(1).optional(),
});

export const projectSchemaPatch = z.object({
        name: z.string().min(5).optional(),
        projectRoot: z.string().min(1).optional(),
        description: z.string().min(1).optional(),
        url: z.string().min(1).optional(),
});
