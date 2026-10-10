# Phase 3B hosted read-only Preview release

Prepared: 2026-10-10

Release branch: `codex/read-only-preview`

Base commit: `bf92c39efdf39980e34b134430f7a7c43fa022a6`

## Release decision

**NO-GO until the Vercel project's environment-variable names and scopes are inspected under an authenticated account.** No push or deployment has occurred.

After that read-only audit passes, this branch is a **conditional GO for a Vercel Preview only**. It is not approved for Production, live Supabase, checkout, administration, or the custom domain.

## Repository and current hosting inventory

- Git remote: `origin` points to `https://github.com/mirathfan/TN_Krishnaiah_Setty-Son.git`.
- The local `main` contained the four hardened commits ahead of `origin/main`; this release branch was created locally from Phase 3A commit `bf92c39`.
- The checkout has no `.vercel/project.json`, so it is not locally linked to a Vercel project.
- Vercel CLI 54.14.0 is installed but has no authenticated session. Private project settings and environment scopes therefore could not be read.
- Existing public URL: `https://tn-krishnaiah-setty-son.vercel.app/`.
- The existing deployment is an older build: `/admin/login`, `/admin/products`, and `/admin/orders` return 404; repository-defined CSP/security headers are absent; and a static asset audit found the original Supabase project reference and legacy mock-session marker. No known local administrative credential value or service-role marker was found. The remote JavaScript was downloaded as text only and was not executed.
- HTTP currently redirects to HTTPS with status 308, and Vercel supplies HSTS on the existing deployment.

## Required environment-variable audit

Vercel environment values must never be printed, exported, or downloaded. Inspect **names, types, target scopes, and branch overrides only** in Project Settings or with authenticated `vercel env list <environment> --format=json` output reduced to names/scopes.

For this read-only release, Production, Preview, branch-specific Preview, and Development must contain none of the following project/integration variables:

- `VITE_ADMIN_USERNAME`, `VITE_ADMIN_PASSWORD`, `VITE_ADMIN_EMAIL`, or any other `VITE_ADMIN_*`
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, or other `VITE_SUPABASE_*`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, or other `NEXT_PUBLIC_SUPABASE_*`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or other `SUPABASE_*`
- `VITE_CHECKOUT_*`, `VITE_DEPLOYMENT_ENVIRONMENT`, or `CHECKOUT_*`

No application variable is required by the read-only storefront. Vercel's own system variables are expected and are not part of this prohibition.

The build is fail-closed: when `VERCEL_ENV` is `preview` or `production`, any forbidden variable name aborts Vite before assets are emitted. The original project receives a dedicated Preview refusal message. CSP additionally sets `connect-src 'self'`, so the hosted read-only browser cannot connect to any Supabase host even if application code regresses.

The ignored local `.env.local` still contains historical development variable names. It is not committed, its sensitive values are checked against the emitted bundle without printing them, and it must never be uploaded or copied to Vercel.

## Exact first Preview procedure

1. Authenticate an authorized Vercel account locally or open the existing project's dashboard. Do not create a new project.
2. Identify the project serving `tn-krishnaiah-setty-son.vercel.app` and confirm its connected Git repository and Production branch. Link locally only after the project ID/name and owner scope are confirmed; never accept a prompt to create a project.
3. Inspect environment-variable **names/scopes only** for Production, Preview, the `codex/read-only-preview` branch override, and Development. Stop if any forbidden name above exists. Removing or changing variables is a separate remote write requiring explicit authorization.
4. Confirm the project uses Vite, build command `npm run build`, output directory `dist`, Node.js 22 or newer, and the repository root as its root directory. Do not save changes during this inspection.
5. Re-run `npm ci` and `npm run verify:phase3a` at the approved release commit.
6. With explicit push/deployment authorization, push exactly `codex/read-only-preview` to `origin`. If the verified Git integration is active, this is the single proposed remote write and should create a Preview automatically. Do not use `vercel --prod` and do not merge to `main`.
7. Record the resulting Preview URL, deployment ID, source commit, build logs, and environment scope audit. Do not connect `tnkrishnaiahsetty.com`.

## Preview smoke tests

Run from a clean/incognito browser at desktop and mobile widths:

1. `curl -I` the Preview root and confirm HTTPS, CSP with `connect-src 'self'`, HSTS, `nosniff`, Referrer Policy, Permissions Policy, `X-Frame-Options: DENY`, COOP, and CORP.
2. Confirm HTTP redirects to HTTPS and `/admin/login`, `/admin/products`, `/admin/orders`, and a product deep link all return the SPA rather than 404.
3. Confirm the preview-catalog notice, unconfirmed price/availability labels, correct branding, phone, address, categories, About copy, and established year.
4. Browse/search/filter products; open a product detail; add, update, and remove cart items.
5. Confirm WhatsApp links use `wa.me/919880226598` with the expected non-sensitive book/cart text. Do not submit or send the message during QA.
6. Confirm checkout remains disabled, admin routes show the safety lock, and browser storage contains no customer/order/admin session data.
7. In browser Network tools, confirm there are no requests to `*.supabase.co`, no checkout Function call, and no database/image write request.
8. Confirm there are no console errors or warnings other than the accepted Vite build-time chunk warning, which is not a browser console warning.
9. Download the public JS/CSS as text and run the bundle audit for service-role markers, obsolete admin markers/known values, mock-session markers, and unexpected backend URLs without printing values.

## Rollback and containment

A Preview is never promoted automatically. If any smoke test fails:

1. Do not merge or promote the branch.
2. Remove any shared Preview alias or enable Deployment Protection only with explicit authorization; the immutable Preview can otherwise remain for investigation.
3. Fix locally, create a new reviewed commit, rerun all checks, and deploy a new Preview. Do not mutate the failed deployment.
4. If a future Production promotion fails, use Vercel's rollback/promote control to restore the last verified Production deployment, then repeat header, route, console, network, and bundle checks. Environment changes affect only new deployments, so compare the exact deployment/environment snapshot.

## Criteria for read-only Production approval

All are mandatory:

- Preview environment audit completed with no forbidden backend/admin/checkout variables.
- Preview build, bundle audit, automated tests, desktop/mobile smoke tests, deep-link routing, HTTPS, CSP, and security headers pass.
- No Supabase connection, client instantiation, checkout submission, admin access, or database/image write is observed.
- Store owner approves the preview catalog wording, branding, contact details, WhatsApp flow, and current fallback shop image.
- A named rollback owner and last-known-good Production deployment are recorded.
- The exact Preview commit/artifact is approved for promotion; no rebuild from a different commit.
- Explicit authorization is given for the Production remote write/promotion.

Live backend restoration, live checkout, administration, payment capture, the original shop photo, and the custom domain remain separate future approvals.

## Local verification evidence

Verified on 2026-10-10 from this release branch:

- Frontend: 35 tests passed; 17 integration tests were skipped in the normal unit run and then executed separately against the disposable local Supabase stack.
- Database and Edge Function: 49 pgTAP assertions passed, 17 integration tests passed, and the local schema lint reported no errors.
- Build: the normal production build passed with only the accepted Vite chunk-size warning; the production bundle audit passed.
- Hosted isolation: clean Preview and Production-class builds with no application environment variables passed. The hosted JavaScript was 348.09 kB and contained no Supabase hostname, checkout endpoint, Supabase client class marker, service-role marker, obsolete admin marker, or mock-session marker.
- Fail-closed checks: a Preview build with the historical local environment was refused because it targeted the original project; a Production-class build with forbidden variable names was also refused before assets were emitted. Only variable names were reported.
- Dependencies: `npm audit --omit=dev` reported zero vulnerabilities.
- Desktop browser: homepage, product detail, cart browsing, disabled checkout, WhatsApp handoff, and all three blocked admin routes passed with no browser console warnings or errors.
- Mobile browser: a 390 x 844 device viewport showed no document-level horizontal overflow; the responsive breakpoint, preview labeling, browsing flow, and safety controls remained active.
- Existing public deployment: HTTPS redirect and Vercel HSTS passed, but the deployed artifact is the older, unhardened build described above and is not the candidate tested here.
