import { ZodError } from "zod";

export function formatZodErrors(error: ZodError) {
  return error.issues.map(e => `${e.path.join('.')} - ${e.message}`);
}