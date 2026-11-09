# Factory registration and validation

A factory registers itself, a DOED admin validates it, and the factory can then log in. Every
factory journey (enrollment, self-evaluation, results email) starts here, because the seed has no
factory.

## Sub-features

- `register` creates the account and factory from `POST /factories/register`.
- `validate` lets a DOED admin approve it with `PATCH /admins/factories/validate/{id}`.
- `factory-login` logs the factory in without an OTP; an unvalidated factory gets 401
  `factory not validate`.

## How to get to it (user POV)

- The public registration form posts `/factories/register`.
- The DOED admin console lists factories at `GET /admins/factories` and validates one.

## Driving it with stack.sh

Preconditions: baseline. Pick a `subdistrictId` from `$S sql 'SELECT id FROM "Subdistricts" LIMIT 1'`
(check the table name in `src/drizzle/schema.ts`).

- **Register.** Run `$S call POST /factories/register` with a JSON body holding the required
  fields from the OpenAPI document: `factoryType`, `nameTh`, `nameEn`, `tsicCode`, `addressNo`,
  `zipcode`, `phoneNumber`, `subdistrictId`, `username`, `password`, `email`.
- **Refused before validation.** Run `$S login <username> <password>`. It fails with 401
  `factory not validate`.
- **Validate.** Run `$S login test1 12345`, find the factory id with `$S call GET /admins/factories`,
  then `$S call PATCH /admins/factories/validate/<id>`.
- **Proof.** `$S login <username> <password>` now prints the factory account.

## Gotchas

- Not yet driven end to end. The first run should fix any step above that does not match the code
  and then mark it proven in the README.
