---
name: frontend-data
description: TanStack Query patterns, axios client with 401 refresh, Zustand stores, form patterns.
---

# Frontend: data fetching + state

## API client (`lib/api/client.ts`)

- One axios instance, `withCredentials: true`, base URL `${VITE_API_BASE_URL}/api/v1`.
- Request interceptor: attach `Authorization: Bearer <access>` from `sessionStorage`.
- Response interceptor: on 401, queue **safe** requests through a single in-flight refresh
  via `inflightRefresh`. Mutations are not retried by default; opt-in with
  `_allowReplay: true` on the request config.
- All errors are wrapped in `ApiError { code, message, status, details, requestId }`.
- Switch on `error.code`, never `error.message.includes(...)`.

## TanStack Query

- Defaults in `lib/api/query-client.ts`: `staleTime: 30s`, `gcTime: 5m`, no refetch on focus,
  `retry: 2` for queries (skipped on 4xx), no retry for mutations.
- **Keys are tuples**, defined per feature in `<feature>/api.ts`:

  ```ts
  export const compressKeys = {
    all: ["compress"] as const,
    job: (id: string) => [...compressKeys.all, "job", id] as const,
    jobsList: (filters: { status?: JobStatus | "all" }) =>
      [...compressKeys.all, "jobs", filters] as const,
  };
  ```

- Mutations explicitly `setQueryData` for the just-touched entity and `invalidateQueries` for
  the list — never both.
- Avoid waterfalls: independent queries fire via `useQueries`, not chained `useQuery`.
- No data fetching in `useEffect`. The only effects in the app sync with non-React systems
  (EventSource, XHR, idle callbacks).

## Auth state (Zustand)

`features/auth/store.ts` holds `user`, `organization`, `hasAccess`. Methods: `setSession`,
`setAccess` (token-only refresh), `setUser`, `clear`. The store calls `setAccessToken` to keep
the axios client in sync.

Anonymous flow:

- `features/auth/ensure-session.ts:ensureAnonymousSession()` is a deduped, fire-and-forget call
  to `POST /auth/anonymous` that no-ops if `hasAccess` is already true.
- Tool routes `beforeLoad: async () => { await ensureAnonymousSession(); }`.

## UI state (Zustand persisted)

`stores/ui-store.ts` holds `theme` + `sidebarCollapsed`. `persist` middleware,
`name: "papyrus.ui.v1"`.

**Subscribe narrowly**: `useUiStore((s) => s.theme)`. Never destructure (re-renders every tick).

## Per-feature stores

`features/pdf-compress/store.ts` (`useUploadStore`) and `features/pdf-merge/store.ts`
(`useMergeStore`) hold in-flight upload/job state. Both `persist`ed under
`papyrus.uploads.v1` / `papyrus.merge.v1`. They have `clearStale(olderThanMs)` to garbage
collect old entries.

## Forms

- React Hook Form + Zod (`@hookform/resolvers/zod`).
- Zod schema is the source of truth; types via `z.infer`.
- Inputs have a stable `id` matched to `htmlFor` on the label.
- `FormField` from `components/ui/form-field.tsx` wraps label + error + hint.
- Show inline errors with `aria-invalid` + `role="alert"`.
- Disable submit while pending; show a busy label.

## Error UI

`ApiError` carries `error.code`. UI switches on the code:

```ts
if (err instanceof ApiError && err.code === "quota_exceeded") {
  toast.error("Quota exceeded. Sign up for more.");
}
```

`error.message` is for fallback display only.

## Bundle hygiene

- Routes are auto code-split by TanStack Router; never import a route module from outside its file.
- Lazy-load expensive client libs (pdfjs-dist already lazy in `PageThumbnails`).
- Devtools are `lazy()`-imported in dev only.
