---
name: frontend-architecture
description: Layouts (marketing vs app shell with sidebar), routing, theming, providers, error boundary.
---

# Frontend: architecture

## Entry

```
main.tsx
  └─ <StrictMode>
     └─ <ErrorBoundary>           # components/shared/error-boundary.tsx
        └─ <AppProviders>         # app/providers.tsx
           ├─ ThemeProvider       # html.dark + colorScheme
           ├─ QueryClientProvider
           ├─ SessionBootstrap    # features/auth/session-bootstrap.tsx
           ├─ Toaster (sonner, bottom-right)
           └─ <AppRouter>         # app/router.tsx (TanStack Router)
              └─ routeTree.gen.ts
                 └─ __root.tsx
                    └─ <AppShell>
                       └─ <Outlet />
```

## Three layouts via `AppShell`

`components/layout/app-shell.tsx` picks one of three:

1. **Auth forms** (`/login`, `/signup`, `/forgot-password`, `/reset-password`) — no chrome.
   The page itself is `AuthLayout` (two-column with brand panel).
2. **App routes when `hasAccess`** (`/dashboard`, `/tools/*`, `/settings`) — `AppSidebar` +
   `AppHeader` + `AppMobileDrawer` on mobile.
3. **Marketing / fallback** (`/`, signed-out) — `Topbar` only.

Tool routes (`/tools/*`) also use the sidebar shell — anon users with a session see the same
navigation. They get the `AnonymousBanner` at the top of each tool page nudging signup.

## Theming

- Tokens in `styles/globals.css` under `@theme` with a `:root.dark` override (CSS variables).
- `useUiStore` (persisted) holds `theme: "light" | "dark" | "system"`.
- `ThemeProvider` applies the right class on `<html>` + listens to `prefers-color-scheme`.
- An inline boot script in `index.html` runs before React hydrates to avoid the dark-mode flash.
- `ThemeToggle` is a fieldset of radio inputs (a11y-clean).

## Sidebar

- Collapsible (state persisted to ui-store).
- Workspace section hidden for anon users; Tools section always visible.
- Settings link hidden for anon users.
- User card: real auth → logout button, anon → "Sign up" CTA.

## TanStack Router

- File-based routing under `src/app/routes/`. `routeTree.gen.ts` is auto-generated.
- `defaultPreload: "intent"` so links prefetch on hover/focus.
- Route protection with `beforeLoad`:

  ```ts
  // Requires real account (anon → /login)
  beforeLoad: () => {
    const s = useAuthStore.getState();
    if (!s.hasAccess || s.user?.isAnonymous) throw redirect({ to: "/login" });
  }

  // Tool pages — anon is OK, mint a session lazily
  beforeLoad: async () => { await ensureAnonymousSession(); }

  // Auth forms — already-authed users skip to /dashboard
  beforeLoad: () => {
    if (useAuthStore.getState().hasAccess) throw redirect({ to: "/dashboard" });
  }
  ```

## Error boundary

`components/shared/error-boundary.tsx` wraps the app. Logs in dev, shows a friendly retry +
reload UI in prod.

## Mobile

- Layouts go `min-h-svh` (small viewport) not `min-h-screen`.
- Tap targets ≥ 44px for primary actions (`h-11+`).
- Every page must work at 360px wide.
- The sidebar collapses to an off-canvas drawer below `md`.

## Vite

- `@vitejs/plugin-react` (not `-swc` — Rolldown's native transformer is faster when no SWC
  plugins are used).
- Manual chunks for react / tanstack / vendor-forms / vendor-icons / vendor-net /
  vendor-pdf / vendor-toast / vendor-ui / vendor-state.
- pdfjs-dist is lazy-loaded only inside `PageThumbnails` (the only consumer).
- Devtools (`@tanstack/react-router-devtools`, `@tanstack/react-query-devtools`) are
  `lazy()`-imported in dev only.
