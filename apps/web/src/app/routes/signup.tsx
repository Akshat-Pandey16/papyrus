import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useSignupMutation } from "@/features/auth/api";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { ErrorBanner } from "@/features/auth/components/error-banner";
import { PasswordInput } from "@/features/auth/components/password-input";
import { type SignupInput, signupSchema } from "@/features/auth/schemas";
import { useAuthStore } from "@/features/auth/store";

export const Route = createFileRoute("/signup")({
  beforeLoad: () => {
    if (useAuthStore.getState().hasAccess) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: SignupPage,
});

const requirements = ["At least 8 characters", "A letter and a number", "Passwords must match"];

function SignupPage() {
  const navigate = useNavigate();
  const mutation = useSignupMutation();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: "", email: "", password: "", confirmPassword: "" },
  });

  const password = watch("password") ?? "";
  const confirmPassword = watch("confirmPassword") ?? "";

  const checks = [
    password.length >= 8,
    /[A-Za-z]/.test(password) && /\d/.test(password),
    password.length > 0 && password === confirmPassword,
  ];

  const onSubmit = handleSubmit(async (values) => {
    await mutation.mutateAsync(values);
    await navigate({ to: "/dashboard" });
  });

  const busy = isSubmitting || mutation.isPending;

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Free forever for individuals. Upgrade for higher quotas and team features."
      footer={
        <>
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <ErrorBanner error={mutation.error} />

        <FormField id="fullName" label="Name" error={errors.fullName?.message}>
          <Input
            id="fullName"
            autoComplete="name"
            placeholder="Ada Lovelace"
            aria-invalid={Boolean(errors.fullName)}
            {...register("fullName")}
          />
        </FormField>

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

        <FormField id="password" label="Password" error={errors.password?.message}>
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
          label="Confirm password"
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

        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
          {requirements.map((req, i) => {
            const ok = checks[i] ?? false;
            return (
              <li
                key={req}
                className={[
                  "flex items-center gap-1.5 text-xs transition-colors",
                  ok ? "text-foreground" : "text-muted-foreground",
                ].join(" ")}
              >
                <span
                  className={[
                    "grid h-4 w-4 place-items-center rounded-full transition-colors",
                    ok ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground/70",
                  ].join(" ")}
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {req}
              </li>
            );
          })}
        </ul>

        <Button type="submit" size="lg" disabled={busy} className="mt-2 h-11 text-[0.95rem]">
          {busy ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
