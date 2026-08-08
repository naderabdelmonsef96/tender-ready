# TenderReady — Phase 1 (Foundation) Implementation Plan

Phase 1 delivers the secure, multi-tenant, bilingual foundation that every later phase builds on. Phases 2–6 stay documented roadmap items and are not implemented here.

## Already in place (verified)

Backend foundation was applied in the previous session and is live:

- Auth-linked `profiles`, `organizations`, `organization_memberships`, `company_settings`, `feature_flags`, `clients`, `tenders`, `workflow_templates`, `workflow_stages`, `notifications`, append-only `audit_events` — each with grants and row-level access rules.
- Membership helper functions used by the access rules (`is_org_member`, `has_org_role`, `has_any_org_role`), locked to signed-in users.
- Signup trigger: creates the profile, links pending invitations by email, and makes the very first user admin of the pilot organization.
- Private `tender-files` bucket with organization-folder-scoped access rules.
- Seed data: Elevate Engineering organization, company settings, Silver Sands client, tender `TND-2026-001`, the seven workflow stages, `roadmap_features` flag off.
- Design tokens (navy/teal/gold/blue in oklch), Inter + Cairo fonts, full EN/AR text bundles, i18n setup, logo and favicon, `decimal.js` installed.
- Organization settings and membership server functions with admin-only checks plus audit writes.

## What Phase 1 still builds

### 1. Authentication surfaces
- `/auth` — sign in, sign up (full name, email, password), and forgot-password, in one bilingual card using the approved navy/teal identity.
- `/reset-password` — public route that accepts the recovery link and sets a new password.
- Email + password only in Phase 1 (Google sign-in is a later decision, since the pilot is an internal engineering team).
- Session listener registered once at the app root so signing in or out immediately updates the UI.

### 2. Tenancy and app shell
- Auth gate for every internal screen; unauthenticated visitors go to `/auth`, and their intended destination is restored after sign-in.
- App shell matching the approved screens: fixed left sidebar with the TenderReady logo and stage-grouped navigation, dense top header with organization switcher, EN/AR toggle, notification bell, and the signed-in user's name and role.
- Language toggle flips the whole interface between English/LTR and Arabic/RTL without a reload and without losing form state.
- Active organization is held in app context; every query is scoped to it, and users with more than one membership can switch.
- A "no active membership" state for a signed-in user who has not been invited anywhere yet.

### 3. Home and governance screens
- `/` becomes the signed-in home (public visitors are sent to `/auth`): tender pipeline cards, stage progress strip, and the tender table fed from real database rows, with proper empty and loading states.
- `/approvals` — minimal functional approval inbox listing items awaiting the signed-in user's roles, with the self-approval block visible and explained. Full routing logic arrives with later phases.
- `/audit` — read-only audit trail for the active organization: actor, action, object, timestamp, material-change marker.
- Placeholder-but-real routes for screens 02–06 (BOQ & Requirements, Portfolio Match, Supply Route, Pricing Builder, Commercial Review), each carrying the correct shell, stepper position, page metadata, and an explicit "arrives in Phase 2/3/4" notice. No fake data, no invented prices.

### 4. Admin screens
- `/settings/company` — company identity, tax and registration numbers, address, contact details, bank details, quotation numbering pattern, validity days, default terms, footer, signature block. Admin-only, wired to the existing server function.
- `/settings/users` — member list with roles, invite by email with role, change role, remove member. Admin-only; an admin cannot strip their own admin role.
- `/admin/workflows` — read-only view of the seven seeded stages and their approver roles, with the roadmap-flag notice for drag-and-drop editing.

### 5. Access-rule testing
- A scripted verification run that signs in as two users in different organizations and confirms: cross-organization tender and settings reads return nothing, a non-admin cannot change company settings or roles, an audit row cannot be edited or deleted, and a tender file in another organization's folder cannot be listed or downloaded.
- Results reported in plain language; any failure is fixed before Phase 1 is called done.

### 6. Visual and accessibility QA
- Every screen inspected at 1920x1080, 1440x900, and 1024x768, in both English and Arabic, with long labels, large EGP values, and dense tables.
- Fix overflow, clipping, broken table columns, mirrored padding, and unwanted horizontal scroll. No commercial or approval data hidden to make layouts fit.
- Keyboard focus, labelled controls, semantic tables, AA contrast.

## Explicitly out of scope for Phase 1

File ingestion and extraction, requirements register, portfolio matching, sourcing routes, the pricing engine, quotation generation, AI assistance, SLA analytics, and the visual workflow editor. Screens 07–08 stay behind `roadmap_features`.

## Technical notes

- Routes are TanStack Start file routes; internal screens live under the `_authenticated` layout. Each route defines its own page metadata.
- All privileged reads and writes go through `createServerFn` with the authenticated middleware, so access rules apply as the signed-in user. No service-role access from the browser.
- Tender files are only ever reached through short-lived signed URLs.
- Forms use React Hook Form + Zod with bilingual validation messages; server functions re-validate every input.
- TanStack Query owns server state, keyed by active organization so switching organizations cannot show stale data.
- Money stays `numeric` in the database and `Decimal.js` in the browser from the moment values appear.
- Material admin actions write an append-only audit event.
- TypeScript strict, no `any`, shared shadcn components and brand tokens only.

## Definition of done

A new user can sign up, land in the pilot organization, switch language and direction, see real seeded tender data, manage company settings and members as admin, view the audit trail, and be provably unable to see another organization's data — with all screens clean at three widths in both directions.
