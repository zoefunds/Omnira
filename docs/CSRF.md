# CSRF in Omnira

## TL;DR

We do **not** ship any CSRF token system because Omnira's auth surface does not use cookies. Every authenticated request carries a JWT in the `Authorization: Bearer …` header, which browsers do not attach automatically on cross-origin requests, so a malicious third-party site cannot trick a logged-in user's browser into making an authenticated request on their behalf.

If you ever switch to cookie-based auth, **add CSRF protection before merging**. This doc records the threat model, why we're safe today, and the change-control checklist.

---

## Why JWT-in-header is CSRF-safe

A CSRF attack works by making an authenticated user's **browser** issue a request to your domain *with their credentials automatically attached*. The classic example:

```html
<!-- on evil.com -->
<form action="https://omnira-api-production.up.railway.app/me/wallet/export" method="POST">
  <input name="password" value="" />
</form>
<script>document.forms[0].submit()</script>
```

If `omnira-api` accepted **cookies** as the auth mechanism, the browser would attach `Cookie: session=…` to that POST and the API would happily process it.

Because Omnira reads auth from a manually-added header (`Authorization`), the form above arrives at the API **without any token at all** and is rejected with `401 UNAUTHORIZED`. The browser will not — and cannot — write an `Authorization` header for the attacker.

This is the standard SPA pattern and is recognized by OWASP as one of the canonical CSRF mitigations:
- OWASP CSRF Prevention Cheat Sheet → *"Using Custom Request Headers"*
- *"This defense relies on the same-origin policy preventing the attacker from setting these headers"*

---

## Reinforcing assumptions

For this to remain safe, the following must stay true:

1. **Never** put the JWT in a cookie that the browser will send automatically.
2. **Never** accept any auth credential from a query string, hidden form field, or `Cookie` header.
3. CORS on the API must remain permissive only for safe methods/headers and only return `Access-Control-Allow-Credentials: true` if we never use cookies for auth. Currently we have `origin: true, credentials: true` for Socket.IO — re-evaluate if cookies are ever introduced.
4. The Vercel frontend and Railway API stay on different origins (`omnira-blond.vercel.app` vs `omnira-api-production.up.railway.app`), so the browser's same-origin policy is doing useful work.

---

## When to add CSRF tokens

Add a token system the moment any of these become true:

- We start using `Set-Cookie` for `omnira.auth.token` or any auth-equivalent value
- We introduce a same-origin proxy where the cookie is set by a Next.js route handler and forwarded to the API
- We add server-rendered HTML forms that POST to our backend without JavaScript

Recommended approach when that day comes:

- **Double-submit cookie** with the `__Host-` prefix and `SameSite=Strict`
- The token value is generated in a Next.js route handler, set as a cookie, and also rendered into the form as a hidden field
- The API checks that the header/body token matches the cookie before processing the request

Reference: Fastify has [`@fastify/csrf-protection`](https://github.com/fastify/csrf-protection) which integrates with `@fastify/cookie` — the implementation is roughly 30 lines.

---

## Today's checks (manual)

Spot-check that nothing has drifted by:

```bash
# 1) /auth/me without Authorization should be 401
curl -i https://omnira-api-production.up.railway.app/auth/me

# 2) /auth/me with Cookie but no Authorization should be 401
curl -i -H 'Cookie: omnira.auth.token=anything' https://omnira-api-production.up.railway.app/auth/me

# 3) /auth/me with Authorization should be 200
curl -i -H "Authorization: Bearer $JWT" https://omnira-api-production.up.railway.app/auth/me
```

If (1) or (2) ever returns 200, CSRF has become a real concern — re-read this doc.
