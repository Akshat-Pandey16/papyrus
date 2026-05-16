import { z } from "zod";

export const passwordRule = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), {
    message: "Include at least one letter and one digit",
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Required"),
    password: passwordRule,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })
  .refine((v) => v.password !== v.currentPassword, {
    path: ["password"],
    message: "New password must differ from current",
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const profileSchema = z.object({
  fullName: z
    .string()
    .max(200)
    .transform((v) => v.trim())
    .or(z.literal("")),
});

export type ProfileInput = z.infer<typeof profileSchema>;
