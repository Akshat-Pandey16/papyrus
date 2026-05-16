import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { CheckCircle2, Monitor, Shield, User as UserIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  useChangePasswordMutation,
  useRequestEmailVerificationMutation,
  useRevokeOtherSessionsMutation,
  useRevokeSessionMutation,
  useSessionsQuery,
  useUpdateProfileMutation,
} from "@/features/account/api";
import {
  type ChangePasswordInput,
  changePasswordSchema,
  type ProfileInput,
  profileSchema,
} from "@/features/account/schemas";
import { PasswordInput } from "@/features/auth/components/password-input";
import { useAuthStore } from "@/features/auth/store";
import { ApiError } from "@/lib/api/client";

export const Route = createFileRoute("/settings")({
  beforeLoad: ({ location }) => {
    if (!useAuthStore.getState().hasAccess) {
      throw redirect({
        to: "/login",
        search: { next: location.pathname } as never,
      });
    }
  },
  component: SettingsPage,
});

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function SettingsPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="w-full px-6 py-10 sm:px-10 lg:px-14">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-10">
        <header className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Account
          </span>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Settings</h1>
          <p className="text-[0.95rem] text-muted-foreground">
            Manage your profile, password, and active sessions.
          </p>
        </header>

        <SectionCard
          icon={<UserIcon className="h-4 w-4" />}
          title="Profile"
          description="Update how your name appears across Papyrus."
        >
          <ProfileForm />
        </SectionCard>

        {user && !user.emailVerifiedAt ? (
          <SectionCard
            icon={<CheckCircle2 className="h-4 w-4" />}
            title="Email verification"
            description="Verify your email to recover your account and unlock collaboration features."
          >
            <EmailVerificationPanel />
          </SectionCard>
        ) : null}

        <SectionCard
          icon={<Shield className="h-4 w-4" />}
          title="Password"
          description="Use a strong password you don't reuse anywhere else."
        >
          <ChangePasswordForm />
        </SectionCard>

        <SectionCard
          icon={<Monitor className="h-4 w-4" />}
          title="Active sessions"
          description="Sign out individual devices or revoke every session except this one."
        >
          <SessionsPanel />
        </SectionCard>
      </div>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <header className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-foreground/5 text-foreground">
          {icon}
        </div>
        <div className="flex flex-col">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function ProfileForm() {
  const user = useAuthStore((s) => s.user);
  const mutation = useUpdateProfileMutation();
  const form = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: user?.fullName ?? "" },
  });

  useEffect(() => {
    if (user) form.reset({ fullName: user.fullName ?? "" });
  }, [user, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync(values);
      toast.success("Profile updated.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update profile.");
    }
  });

  const busy = form.formState.isSubmitting || mutation.isPending;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormField id="fullName" label="Full name" error={form.formState.errors.fullName?.message}>
        <Input id="fullName" placeholder="Your name" {...form.register("fullName")} />
      </FormField>
      <FormField id="email" label="Email">
        <Input id="email" value={user?.email ?? ""} disabled readOnly />
      </FormField>
      <Button type="submit" disabled={busy} className="self-start">
        {busy ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}

function ChangePasswordForm() {
  const mutation = useChangePasswordMutation();
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", password: "", confirmPassword: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync(values);
      toast.success("Password updated. Other sessions signed out.");
      form.reset();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not change password.");
    }
  });

  const busy = form.formState.isSubmitting || mutation.isPending;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormField
        id="currentPassword"
        label="Current password"
        error={form.formState.errors.currentPassword?.message}
      >
        <PasswordInput
          id="currentPassword"
          autoComplete="current-password"
          {...form.register("currentPassword")}
        />
      </FormField>
      <FormField id="password" label="New password" error={form.formState.errors.password?.message}>
        <PasswordInput id="password" autoComplete="new-password" {...form.register("password")} />
      </FormField>
      <FormField
        id="confirmPassword"
        label="Confirm new password"
        error={form.formState.errors.confirmPassword?.message}
      >
        <PasswordInput
          id="confirmPassword"
          autoComplete="new-password"
          {...form.register("confirmPassword")}
        />
      </FormField>
      <Button type="submit" disabled={busy} className="self-start">
        {busy ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}

function EmailVerificationPanel() {
  const user = useAuthStore((s) => s.user);
  const request = useRequestEmailVerificationMutation();
  const [debugToken, setDebugToken] = useState<string | null>(null);

  if (!user) return null;

  const onSend = async () => {
    try {
      const { debugToken: tok } = await request.mutateAsync();
      setDebugToken(tok);
      toast.success("Verification email sent.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not send verification email.");
    }
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-muted-foreground">
        We&apos;ll send a verification link to <span className="font-medium">{user.email}</span>.
      </p>
      <Button onClick={onSend} disabled={request.isPending} className="self-start">
        {request.isPending ? "Sending…" : "Send verification email"}
      </Button>
      {debugToken ? (
        <p className="rounded-md bg-foreground/5 p-3 text-xs">
          Dev mode debug token: <code className="break-all">{debugToken}</code>
        </p>
      ) : null}
    </div>
  );
}

function SessionsPanel() {
  const query = useSessionsQuery();
  const revokeOne = useRevokeSessionMutation();
  const revokeOthers = useRevokeOtherSessionsMutation();

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading sessions…</p>;
  }
  if (query.error) {
    return <p className="text-sm text-destructive">Could not load sessions.</p>;
  }
  const sessions = query.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {sessions.map((s) => (
          <li
            key={s.id}
            className="flex flex-col gap-1 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-col gap-0.5 text-sm">
              <span className="font-medium">
                {s.userAgent ?? "Unknown device"} {s.current ? "· This device" : null}
              </span>
              <span className="text-xs text-muted-foreground">
                {s.ipAddress ?? "Unknown IP"} · last refreshed {formatDate(s.createdAt)}
              </span>
            </div>
            <Button
              size="sm"
              variant={s.current ? "ghost" : "outline"}
              disabled={s.current || revokeOne.isPending}
              onClick={() => revokeOne.mutate(s.id)}
            >
              {s.current ? "Current" : "Revoke"}
            </Button>
          </li>
        ))}
      </ul>
      {sessions.filter((s) => !s.current).length > 0 ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => revokeOthers.mutate()}
          disabled={revokeOthers.isPending}
          className="self-start"
        >
          {revokeOthers.isPending ? "Signing out…" : "Sign out all other sessions"}
        </Button>
      ) : null}
    </div>
  );
}
