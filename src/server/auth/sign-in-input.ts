import * as z from "zod";

// What the sign-in form sends, checked with the same schema in the browser and on the server
// (developer-rules.md rule 13: "Every input is checked on the server with Zod"; 13-technology.md,
// Forms and checks). No password rules (A8): any password that is not empty. The maximums only
// guard the size of what is stored or hashed (review of the plan of 0.6, correction 6; plan,
// decision 12). Each message is a key of `login.errors` in the message files.

export const USERNAME_MAX = 256;
export const PASSWORD_MAX = 4096;
export const RETURN_PATH_MAX = 2048;

export const signInInput = z.object({
  username: z.string().trim().min(1, "required").max(USERNAME_MAX, "tooLong"),
  password: z.string().min(1, "required").max(PASSWORD_MAX, "tooLong"),
  returnPath: z.string().max(RETURN_PATH_MAX).optional(),
});

export type SignInInput = z.infer<typeof signInInput>;
