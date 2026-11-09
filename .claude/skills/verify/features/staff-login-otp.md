# Staff login with emailed OTP

A staff account (DOED, Evaluator, Provincial) that has changed its first password logs in with a
password, receives a 6-digit OTP by email, and exchanges it for the `Authentication` and `Refresh`
cookies. This journey exercises the whole email path: API, Redis queue, worker, SMTP.

## Sub-features

- `login-password` checks the password and opens an OTP challenge (`twoFactorRequired: true`).
- `login-otp-email` queues the `2fa-otp` job; the worker sends the code.
- `login-verify` exchanges `challengeId` and code for cookies.
- `whoami` returns the logged-in account from `GET /authentication`.

## How to get to it (user POV)

- The staff login screen posts `/authentication/login`, then `/authentication/login/verify-otp`.

## Driving it with stack.sh

Preconditions: baseline. `test1` has `change_pw: true`, so it needs an OTP.

- **Log in.** Run `$S login test1 12345`. It prints the account JSON with `"role":"DOED"`.
- **Check the email.** Run `$S mail`. A message to `admin@test.com` with subject
  `รหัส OTP สำหรับเข้าสู่ระบบ` is listed. Save it with `$S mail-save <id>`.
- **Proof.** `.verify-evidence/login-test1.json` holds `twoFactorRequired: true`,
  `verify-otp-test1.json` holds `"message":"login successful"`, and `whoami-test1.json` holds the
  account.

## Gotchas

- A second login inside the challenge TTL (`OTP_CHALLENGE_TTL`, 300 s) reuses the same
  `challengeId` and sends no new email. `stack.sh login` then uses the newest OTP email for that
  address, which belongs to the same challenge.
- Do not use the `x-dev-bypass` header for this proof. It skips the email path this journey exists to show.
