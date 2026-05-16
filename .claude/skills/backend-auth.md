---
name: backend-auth
description: Authentication — anonymous mode, JWT access tokens, refresh-token rotation with reuse detection, sessions, email verification, change-password.
---

# Backend: auth

## Token model

- **Access token** — short-lived JWT (15 min default), HS256, signed with `jwt_secret`.
  Stored client-side in `sessionStorage` + memory. Sent as `Authorization: Bearer`.
- **Refresh token** — opaque random bytes (48-byte url-safe), **not a JWT**. Stored server-side
  as HMAC-SHA256 hash peppered with `jwt_secret`. Delivered to the client only in an httpOnly,
  Secure, `SameSite=Lax`, path-scoped (`/api/v1/auth`) cookie.

## Refresh-token rotation with reuse detection

`RefreshTokenRepository` (`repositories/users.py`) — every refresh issues a new token and revokes
the old. If a **revoked** token is ever presented, the entire chain (parent → descendants) is
revoked. Implementation:

```python
record = await self.refresh_tokens.get_by_hash(hash_opaque_token(refresh_token))
if record.revoked_at is not None:
    root_id = await self.refresh_tokens.find_root_ancestor(record)
    await self.refresh_tokens.revoke_chain(root_id)  # recursive CTE
    raise AuthenticationError("Refresh token replay detected.")
```

Absolute lifetime cap: `refresh_absolute_ttl_seconds` (90 days). Sliding TTL:
`jwt_refresh_ttl_seconds` (30 days).

## Anonymous mode

The product is anonymous-first. `POST /api/v1/auth/anonymous` mints a real User + Org with
`is_anonymous=true`. Same access/refresh token plumbing as a real signup. Cleanup task
`papyrus.cleanup.purge_anonymous` (hourly) deletes anon orgs/users older than 24h.

- Quota differentiation: services accept `is_anonymous: bool` and branch on
  `anon_daily_job_quota` / `anon_max_file_bytes` vs the user variants.
- Routes pass `user.is_anonymous` from `CurrentPrincipal` into services.
- Anonymous users still get an auth banner suggesting signup; dashboard/settings redirect anon
  users to `/login`.

## Email verification

- `POST /api/v1/auth/verify-email/request` — issues an opaque token, returns it in dev as
  `debug_token` for testing. Wire real email later.
- `POST /api/v1/auth/verify-email/confirm` — accepts token, marks `email_verified_at`.
- Reuses `password_reset_tokens` table for the token store (same shape).

## Sessions management

- `GET /api/v1/auth/sessions` — list active refresh tokens for the current user. Marks the
  current device based on the cookie hash match.
- `DELETE /api/v1/auth/sessions/{id}` — revoke a specific session.
- `POST /api/v1/auth/sessions/revoke-others` — revoke every active session except the current.
- Change-password also revokes all other sessions.

## Password handling

- `hash_password` / `verify_password` / `needs_rehash` — argon2-cffi with OWASP 2024 params
  (`m=19456, t=2, p=1`). On successful login, transparently rehash if `needs_rehash`.
- `hash_opaque_token(token)` — HMAC-SHA256 with `jwt_secret` as pepper. Use this for any
  bearer-style secret (refresh tokens, reset tokens, verification tokens).
- `secure_equals(a, b)` — `hmac.compare_digest` wrapper.

## Forgot/reset password

- `forgot_password` revokes prior outstanding reset tokens, then issues a new one. Returns
  the raw token in dev only.
- `reset_password` revokes all refresh tokens after updating the password (forced re-login
  everywhere).

## Rate limiting

Apply `rate_limit(...)` to every auth route. Tight limits where they matter:
- `/login`: 20 / 5 min (per IP)
- `/signup`: 10 / 60 min
- `/anonymous`: 30 / 60 min
- `/forgot-password`: 5 / 60 min
- `/reset-password`: 10 / 60 min
- `/refresh`: 120 / 5 min
- `/change-password`: 10 / 60 min
- `/verify-email/*`: 5–10 / 60 min

Limiter is in `core/rate_limit.py`. It's a single atomic `INCR + EXPIRE` Lua script.

## Cookie helpers

Use `core/cookies.set_refresh_cookie` / `clear_refresh_cookie` — never set the cookie inline.
`Secure` is true whenever the env isn't development.

## Adding a new auth flow

1. Method on `IdentityService` (commits at the end).
2. Schema in `schemas/identity.py`.
3. Route in `api/v1/auth.py` (or `api/v1/users.py` for profile mutations).
4. If unauthenticated, add `rate_limit(...)`.
5. Test the happy path + the reuse/replay detection if it touches refresh tokens.
