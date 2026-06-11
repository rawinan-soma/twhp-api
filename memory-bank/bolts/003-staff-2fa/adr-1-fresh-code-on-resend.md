---
bolt: 003-staff-2fa
created: 2026-06-09T09:00:00Z
status: accepted
superseded_by:
---

# ADR-1: Issue Fresh OTP Code on Resend (vs. Replay Same Code)

## Context

When a staff user requests a resend of their OTP (e.g. the first email was delayed or missed), the system must decide whether to re-send the original code that is already stored in the Redis challenge, or generate and store a new code, invalidating the old one.

The `resendOtp` usecase was flagged during bolt planning as a design question to resolve before implementation. Story `008-resend-otp-endpoint` notes reference this choice explicitly.

## Decision

`resendOtp` generates a **fresh 6-digit OTP**, replaces the stored `codeHash` in the Redis challenge, and resets `attempts` to 0. The previous code is invalidated the moment the new one is stored.

## Rationale

Replaying the same code keeps a live, guessable value in circulation for the entire remaining TTL window — if a second resend occurs or the 60-second throttle lapses, the original code could still arrive in the user's inbox and be valid. Issuing a fresh code at each resend closes that window: only the most-recently-emailed code is ever valid.

Resetting attempts alongside the new code is consistent: the per-challenge attempt cap (5) is a property of a specific code; a new code starts a new attempt budget.

### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Replay same code (re-send stored hash unchanged) | Simpler; no new `randomInt` call; user confusion reduced if emails arrive out of order | Old code remains valid for full TTL after resend; widens brute-force window across emails | Security risk outweighs simplicity gain |
| Replay same code but extend TTL | Prevents expiry-frustration | Same security concern as above, and TTL extension adds complexity | Adds complexity with no security benefit |
| Fresh code + keep existing attempts count | Slightly more punishing to legitimate fat-fingering users | More complex accounting | Marginal benefit; resetting attempts is simpler and more user-friendly within throttle constraints |

## Consequences

### Positive

- Only one valid code in circulation at any moment — the one in the most recent email
- Attempt cap is cleanly scoped per code, not per challenge session
- Reduces multi-email confusion: older emails self-invalidate on next resend

### Negative

- A user who receives two emails out of order (e.g. delayed first delivery after resend) will find the first email's code rejected
- Requires a new `randomInt` + hash + Redis write on every resend (negligible cost)

### Risks

- **Out-of-order email delivery**: A delayed first email arriving after a resend carries a now-invalid code. Mitigated by: (a) clear UI messaging that only the latest code is valid, (b) BullMQ priority ensures OTP emails are fast (priority 1)

## Related

- **Stories**: 002-otp-generation-policy, 003-attempt-lockout, 008-resend-otp-endpoint
- **Standards**: —
- **Previous ADRs**: —
