# Password reset email

Any account can ask for a password reset by email address. The worker sends a reset link to that
address.

## Sub-features

- `reset-request` queues `password-reset-request` for a known email; unknown email returns 404.
- `reset-throttle` refuses a second request while one is pending.

## How to get to it (user POV)

- The "forgot password" screen posts `/authentication/reset-password-request` with `{"email": ...}`.

## Driving it with stack.sh

Preconditions: baseline. No reset is pending for `admin@test.com`.

- **Request.** Run `$S call POST /authentication/reset-password-request '{"email":"admin@test.com"}'`.
  It prints `{"message":"sending password reset email"}` and `HTTP 200`.
- **Check the email.** Run `$S mail`. A message to `admin@test.com` with subject starting
  `รีเซ็ตรหัสผ่าน` is listed. Save it with `$S mail-save <id>`; its body holds a link built from
  `FRONTEND_URL`.
- **Unknown address.** Run the same call with `nobody@example.com`. It returns `HTTP 404`
  `email not found`, and `$S mail` lists nothing new.

## Gotchas

- A repeat request inside the throttle window returns `password reset email already sent, please
  wait before requesting again`. Start from a fresh stack (`$S down`, `$S up`) to repeat the journey.
