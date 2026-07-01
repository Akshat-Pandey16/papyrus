import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { useResetPasswordMutation } from "@/features/auth/api";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { ErrorBanner } from "@/features/auth/components/error-banner";
import { PasswordInput } from "@/features/auth/components/password-input";
import { SuccessBanner } from "@/features/auth/components/success-banner";
import { type ResetPasswordInput, resetPasswordSchema } from "@/features/auth/schemas";

const searchSchema = z.object({
  token: z.string().min(1).optional(),
});

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  validateSearch: searchSchema,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { token = "" } = Route.useSearch();
  const mutation = useResetPasswordMutation();
  const [success, setSuccess] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: "", confirmPassword: "" },
  });

  if (token) {
    setValue("token", token, { shouldValidate: false });
  }

  const onSubmit = handleSubmit(async (values) => {
    await mutation.mutateAsync(values);
    setSuccess(true);
  });

  const busy = isSubmitting || mutation.isPending;

  if (!token) {
    return (
      <AuthLayout
        title="Reset link missing"
        subtitle="The reset link looks incomplete. Request a new one to continue."
        footer={null}
      >
        <Button onClick={() => navigate({ to: "/forgot-password" })} size="lg">
          Request a new reset link
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Pick something memorable but unique. We'll keep your account safe."
      footer={
        <Link
          to="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      }
    >
      {success ? (
        <div className="flex flex-col gap-4">
          <SuccessBanner>
            Your password has been updated. You can now sign in with your new credentials.
          </SuccessBanner>
          <Button onClick={() => navigate({ to: "/login" })} size="lg">
            Continue to sign in
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <ErrorBanner error={mutation.error} />

          <input type="hidden" {...register("token")} />

          <FormField id="password" label="New password" error={errors.password?.message}>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              aria-invalid={Boolean(errors.password)}
              {...register("password")}
            />
          </FormField>

          <FormField
            id="confirmPassword"
            label="Confirm new password"
            error={errors.confirmPassword?.message}
          >
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              placeholder="Repeat your password"
              aria-invalid={Boolean(errors.confirmPassword)}
              {...register("confirmPassword")}
            />
          </FormField>

          <Button type="submit" size="lg" disabled={busy} className="mt-2 h-11 text-[0.95rem]">
            {busy ? "Updating…" : "Update password"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
