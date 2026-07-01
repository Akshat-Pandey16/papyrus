import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useForgotPasswordMutation } from "@/features/auth/api";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { ErrorBanner } from "@/features/auth/components/error-banner";
import { SuccessBanner } from "@/features/auth/components/success-banner";
import { type ForgotPasswordInput, forgotPasswordSchema } from "@/features/auth/schemas";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const mutation = useForgotPasswordMutation();
  const [submitted, setSubmitted] = useState(false);
  const [debugToken, setDebugToken] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    const { debugToken: t } = await mutation.mutateAsync(values);
    setDebugToken(t);
    setSubmitted(true);
  });

  const busy = isSubmitting || mutation.isPending;

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the email associated with your account and we'll send you a link to reset your password."
      footer={
        <>
          Remembered it?{" "}
          <Link
            to="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </>
      }
    >
      {submitted ? (
        <div className="flex flex-col gap-4">
          <SuccessBanner>
            If an account exists for that email, we've sent password reset instructions. Check your
            inbox.
          </SuccessBanner>
          {import.meta.env.DEV && debugToken ? (
            <Button
              variant="outline"
              onClick={() =>
                navigate({
                  to: "/reset-password",
                  search: { token: debugToken },
                })
              }
            >
              Continue to reset (dev only)
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => navigate({ to: "/login" })}>
            Back to sign in
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <ErrorBanner error={mutation.error} />

          <FormField id="email" label="Email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              aria-invalid={Boolean(errors.email)}
              {...register("email")}
            />
          </FormField>

          <Button type="submit" size="lg" disabled={busy} className="mt-2 h-11 text-[0.95rem]">
            {busy ? "Sending link…" : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
