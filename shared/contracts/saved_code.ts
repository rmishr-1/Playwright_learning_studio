import { z } from 'zod';

/**
 * Mirrors Data/Formats/saved_code_format.json. GET /api/exercise/:week/:day/:id/saved: the code the
 * learner last saved for a code exercise, so "Start this in the editor" can bring it back.
 */
export const SavedCode = z.object({
  /** null when the learner has not saved any code of their own for it. */
  code: z.string().nullable(),
  /** Where it was found, in the workspace. */
  file: z.string().nullable(),
  /** The code was found where the exercise's file used to be, before a course update moved it. */
  moved: z.boolean(),
  /** The learner's file is there but too long to load into the editor. */
  too_large: z.boolean(),
});

export type SavedCode = z.infer<typeof SavedCode>;
