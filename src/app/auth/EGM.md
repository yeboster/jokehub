# auth

## Overview
The `/auth` route: a combined email/password log-in and sign-up form backed by `useAuth()` (`@/contexts/AuthContext`). Sources: `page.tsx` (client component) and `layout.tsx` (sets the metadata title `'Log in'`).

## Interface
- `default AuthPage` in `page.tsx`. It wraps `AuthPageComponent` in `Suspense`, with fallback `PageLoading`.
- Module-private:
  - `AuthPageComponent`: the form.
  - `looksLikeEmail(value)`: a minimal shape check: an `@` that is not the first character; the first `.` after the `@` must have at least one character between it and the `@`, and must not be the last character.
- `default AuthLayout` in `layout.tsx`. It sets `metadata.title = 'Log in'` and renders its children unchanged.
- Query param `redirect`: where to go after sign-in. Defaults to `'/jokes'`.

## Invariants
- Once auth has loaded and `user` is set, the page calls `router.push(redirectPath)`.
- The form uses `noValidate`. Validation runs in `handleSubmit`:

  | Field | Condition | Message |
  | --- | --- | --- |
  | Email | Empty after trim | `'Enter your email address.'` |
  | Email | Fails `looksLikeEmail` | `'That doesn’t look like an email address.'` |
  | Password | Empty | `'Enter your password.'` |
  | Password | Shorter than 6 characters | `'Passwords are at least 6 characters.'` |

- After a failed check, focus moves to the first invalid field.
- Firebase error codes are mapped to user copy:
  - `auth/invalid-credential`, `auth/user-not-found` and `auth/wrong-password` share one message.
  - `auth/email-already-in-use` and `auth/invalid-email` each have their own message.
  - Other errors show `error.message`, or a default when it is empty.
- Auth errors appear inline in a `role="alert"` element, not as toasts. The email and password field errors also use `role="alert"`.
- Field errors use `aria-invalid` and `aria-describedby`. `aria-describedby` points only at elements that are rendered: the error, or the sign-up-only `password-hint`.
- Inputs set `autoComplete` to `email`, `current-password` or `new-password`.

## Side Effects
- Firebase Auth calls through `useAuth().signIn` and `useAuth().signUp`.
- Toasts on success, and client navigation through `router.push`.
- Logs errors with `console.error('Auth error:', ...)`.

## Verification
- No colocated test file in this directory. Run the full suite: `npm test`
