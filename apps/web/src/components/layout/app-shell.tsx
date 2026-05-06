import type { ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-svh bg-background text-foreground antialiased">
      <main>{children}</main>
    </div>
  );
}
