import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useLoginMutation } from "@/features/auth/api";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { ErrorBanner } from "@/features/auth/components/error-banner";
import { PasswordInput } from "@/features/auth/components/password-input";
import { type LoginInput, loginSchema } from "@/features/auth/schemas";
import { useAuthStore } from "@/features/auth/store";

function sanitizeNext(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  return value;
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { next?: string } => {
    const next = sanitizeNext(search.next);
    return next ? { next } : {};
  },
  beforeLoad: ({ search }) => {
    const state = useAuthStore.getState();
    if (state.hasAccess && !state.user?.isAnonymous) {
      throw redirect({ to: (search.next ?? "/dashboard") as "/dashboard" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const mutation = useLoginMutation();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    await mutation.mutateAsync(values);
    await navigate({ to: (next ?? "/dashboard") as "/dashboard" });
  });

  const busy = isSubmitting || mutation.isPending;

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue working with your documents."
      footer={
        <>
          New to Papyrus?{" "}
          <Link
            to="/signup"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
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

        <FormField
          id="password"
          label="Password"
          error={errors.password?.message}
          hint={
            <Link
              to="/forgot-password"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Forgot password?
            </Link>
          }
        >
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="••••••••"
            aria-invalid={Boolean(errors.password)}
            {...register("password")}
          />
        </FormField>

        <Button type="submit" size="lg" disabled={busy} className="mt-2 h-11 text-[0.95rem]">
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthLayout>
  );
}
