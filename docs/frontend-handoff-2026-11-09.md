# API changes for the frontend, 2026-11-09

Compares `docs/api/openapi.json` (last committed 2026-09-03) with `docs/api/2026-11-09/openapi.json`.
All paths are under `/twhp/api`. Bodies are written as TypeScript-style types, and `?` marks an optional field.

- **New endpoints:** none.
- **Removed endpoints:** none.
- **Changed endpoints:** 20 of 54, listed below.

**Branch:** `main` @ `492201b` · **Generated:** 9 Nov 2026 · **Follows:** `docs/frontend-handoff.md` (26 Aug / 3 Sep 2026)

## Reference files (regenerated from the running app)

| File | Use |
|---|---|
| `docs/api/2026-11-09/openapi.json` | OpenAPI spec, for generating the client |
| `docs/api/2026-11-09/API.md` | Per-endpoint reference (54 operations) |
| `docs/api/2026-11-09/index.html` | Scalar viewer, opens directly in a browser |

The files directly under `docs/api/` (no date folder) are an old snapshot. Use this set instead.

## Scan summary

Most of the shape changes are the new `fiscalYear` query and the new grade `consec-gold`.
The rest are changes in *meaning* that do not appear in the spec (§ 3–4), so a regenerated client that compiles is not proof that it is safe.

---

## § 1 — Grade now has 5 levels: `consec-gold` added 🔴 BREAKING (enum)

Order (first match wins): `consec-gold` → `gold` → `silver` → `certificate` → `joined`

Applies to the `grade` field in:
- `POST /twhp/api/{admins,evaluators}/covers/:coverId/finalize` (response)
- `GET /twhp/api/{admins,evaluators,provincialOfficers}/score` (`items[].grade`)
- `GET /twhp/api/factories/assessments/score` (response)

To do:
- Add `"consec-gold"` to the UI union/enum. A switch with no default will miss it.
- `gold` is only possible with `special == 1` (a full score is `"3"` only; `n/a` does not count).
- `consec-gold` = the `gold` conditions + `special == 2` + a gold-tier award (`gold` / `consec-gold`) in **that Cover's** fiscal year − 3.
- The grade is stored at finalize, so Covers from past years are not recalculated.

## § 2 — `fiscalYear` query + `fiscalYear` field in responses

Query `fiscalYear` (optional, integer 2000–2100, **the Common Era year the fiscal year ends in**: `2026` = 1 Oct 2025 – 30 Sep 2026; to display the Buddhist Era year, add 543):

| Endpoint | Notes |
|---|---|
| `GET /factories/enrolls` | |
| `GET /factories/assessments/covers` | Response adds `fiscalYear: number` |
| `GET /factories/assessments/score` | Response adds `fiscalYear: number` |
| `GET`, `POST`, `PATCH /factories/assessments/answers` | |
| `POST /factories/assessments/answers/negotiate` | |
| `POST /factories/assessments/submission` | |
| `GET /{admins,evaluators,provincialOfficers}/{factories,enrolls,score}` | Response adds `items[].fiscalYear` |

If omitted, the current fiscal year is used, except on the 9 staff lists, which use the year that just ended during the evaluation period (§ 3).

## § 3 — Evaluation period 🔴 Behaviour change

The fiscal year that just ended stays under evaluation after the 1 Oct rollover. **FY2569 (CE 2026) is extended to 31 Dec 2026** (ends at `2027-01-01T00:00:00+07:00`). Other years use the default 31 days (through 31 Oct).

**Staff side (admin / evaluator / provincial)**
- The 9 list endpoints default to *the year that just ended* throughout this period when `?fiscalYear` is not sent. This year the dashboard numbers switch to the new fiscal year on 1 Jan 2027, not on 1 Oct or 1 Nov.
  If the UI needs the new year, it must send `fiscalYear` itself.
- Every level can save verdicts retroactively for that year. `finalize` remains ODPC-only.
- **A hard reject (`decision: "reject"`) is refused with `400`** on both verdict save and finalize during this period, because factories cannot edit a closed year.
  → The UI should hide or disable the "send back" button for the whole evaluation period (this year 1 Oct – 31 Dec 2026), and use approve or change score instead.
- The extension to 31 Dec is made through the backend config `EVALUATION_PERIOD_END` (ISO 8601 + offset) and applies to this year only. The end date can differ from year to year, so do not hardcode dates in the UI.

**Factory side:** no grace period. Factories must submit before the rollover (`resolveWritableYear`). After 1 Oct they cannot edit or submit the old year.

## § 4 — Score changes are final (confirmed, unchanged from the previous edition)

`docs/frontend-handoff.md` § 2 still applies. In short:

- `change_score` → `status: "recommended"`, the Cover does not bounce, and the factory has nothing to respond to.
- `POST /factories/assessments/answers/negotiate` on an answer with a `verdictChoice` → `400 "this score is final and needs no response"` (both `accept` and `redo`).
- Factory needs-action = `status === "rejected" && verdictChoice === null`.

## § 5 — Enrolment lock after a gold-tier award 🟡

`POST /twhp/api/factories/enrolls` adds a `400`:

```json
{ "message": "enrollment is closed after a gold-tier award; next eligible fiscal year is 2028" }
```

- Condition: the factory received a gold-tier award in the previous 2 fiscal years.
- The number at the end of the message is the first fiscal year (CE) in which the factory can enrol again.
- `message` is dynamic. To parse the year, use the regex `/next eligible fiscal year is (\d{4})/`, or ask the backend to expose it as a separate field.
  Preferably, display the message as received and make no decisions from the string.
- This endpoint now has 3 kinds of 400 response: missing standard file, duplicate enrolment in the fiscal year, and the gold-tier lock.

## § 6 — Provincial Officer: read-only (confirmed)

`GET /twhp/api/provincialOfficers/covers/:coverId/answers` uses the same response schema as evaluator/admin.

- Cover `in_progress` → `404 { "message": "cover not found" }` (same as a Cover outside the province, not a 403).
- Cover `in_review` → every answer has `verdictChoice = null`, `description = null`, `status = "in_review"`.
- Standard certificates are not hidden.
- There are no write routes under `provincialOfficers/**`. Do not show verdict or finalize buttons to this role.

## § 7 — Pagination (confirmed)

All 9 lists still return `{ items, meta: { page, limit, total, totalPages } }`. For details see `docs/frontend-handoff.md` § 1.
(`page` starts at 1, `limit` defaults to 20 with a maximum of 100, a page past the end returns `items: []`, and a 404 is not wrapped in the envelope.)

---

## Frontend checklist

- [ ] Regenerate the client from `docs/api/2026-11-09/openapi.json`
- [ ] Add `consec-gold` to every grade type, label and colour
- [ ] Send `fiscalYear` explicitly on staff list pages when a specific fiscal year is needed
- [ ] Hide the hard reject button during the evaluation period (400)
- [ ] Handle the enrol 400 for the gold-tier lock
- [ ] Remove the factory's "accept score" (`accept`) button
- [ ] Provincial: read-only, handle the 404 and the `null` values during `in_review`

---

## Behaviour changes that do not appear in the spec

These endpoints keep the same request and response shape, but the evaluation period changes what they do.
The FY2569 evaluation period runs from 1 Oct 2026 through 31 Dec 2026. Other years default to 31 days, through 31 Oct.

| Endpoint | During the evaluation period |
|---|---|
| `POST /admins/covers/{coverId}/answers/{answerId}/verdict` | A hard reject returns `400 { "message": "hard reject is closed during the evaluation period..." }`. |
| `POST /evaluators/covers/{coverId}/answers/{answerId}/verdict` | Same `400`. |
| `POST /admins/covers/{coverId}/finalize` | Same `400` if the Cover still holds a hard reject. |
| `POST /evaluators/covers/{coverId}/finalize` | Same `400` if the Cover still holds a hard reject. |
| `GET /{admins,evaluators,provincialOfficers}/{factories,enrolls,score}` | Without `fiscalYear`, these return the year that just ended, not the current one. |

## Changed endpoints

| # | Endpoint | What changed |
|---|---|---|
| 1 | `POST /admins/covers/{coverId}/finalize` | grade `consec-gold` |
| 2 | `GET /admins/enrolls` | query `fiscalYear`, response `fiscalYear` |
| 3 | `GET /admins/factories` | query `fiscalYear`, response `fiscalYear` |
| 4 | `GET /admins/score` | query `fiscalYear`, response `fiscalYear`, grade `consec-gold` |
| 5 | `POST /evaluators/covers/{coverId}/finalize` | grade `consec-gold` |
| 6 | `GET /evaluators/enrolls` | query `fiscalYear`, response `fiscalYear` |
| 7 | `GET /evaluators/factories` | query `fiscalYear`, response `fiscalYear` |
| 8 | `GET /evaluators/score` | query `fiscalYear`, response `fiscalYear`, grade `consec-gold` |
| 9 | `GET /factories/assessments/answers` | query `fiscalYear` |
| 10 | `PATCH /factories/assessments/answers` | query `fiscalYear` |
| 11 | `POST /factories/assessments/answers` | query `fiscalYear` |
| 12 | `POST /factories/assessments/answers/negotiate` | query `fiscalYear` |
| 13 | `GET /factories/assessments/covers` | query `fiscalYear`, response `fiscalYear` |
| 14 | `GET /factories/assessments/score` | query `fiscalYear`, response `fiscalYear`, grade `consec-gold` |
| 15 | `POST /factories/assessments/submission` | query `fiscalYear` |
| 16 | `GET /factories/enrolls` | query `fiscalYear` |
| 17 | `POST /factories/enrolls` | new 400 response |
| 18 | `GET /provincialOfficers/enrolls` | query `fiscalYear`, response `fiscalYear` |
| 19 | `GET /provincialOfficers/factories` | query `fiscalYear`, response `fiscalYear` |
| 20 | `GET /provincialOfficers/score` | query `fiscalYear`, response `fiscalYear`, grade `consec-gold` |

---

## `POST /admins/covers/{coverId}/finalize`

**Changed:** response 200: `grade`

**Parameters**

| Name | In | Type | Required | Notes |
|---|---|---|---|---|
| `coverId` | path | number | yes |   |

**Request body**

`application/json` (unchanged)

```ts
object
```

**Response body**

`200`

```ts
{
  coverStatus: string;
  grade: "consec-gold" | "gold" | "silver" | "certificate" | "joined" | null;
  message: string /* e.g. "cover finalized" */;
}
```

`400` (unchanged)

```ts
{
  message: string;
}
```

`403` (unchanged)

```ts
{
  message: string;
}
```

`404` (unchanged)

```ts
{
  message: string /* e.g. "cover not found" */;
}
```

`500` (unchanged)

```ts
{
  message: string;
}
```

---

## `GET /admins/enrolls`

**Changed:** added query `fiscalYear` · response 200: `items[]/fiscalYear`

**Parameters**

| Name | In | Type | Required | Notes |
|---|---|---|---|---|
| `coverStatus` | query | "finished" \| "in_progress" \| "in_review" \| "none" | no |   |
| `page` | query | number | no |  1-indexed page number. The first page is 1. |
| `limit` | query | number | no |  Items per page. Max 100. |
| `fiscalYear` | query | number | no | **New.** Common Era fiscal year, labelled by its ending year (2026 = 1 Oct 2025 - 30 Sep 2026). Omit for the current fiscal year. Clients render Buddhist Era as this value + 543. |

**Request body**

none

**Response body**

`200`

```ts
{
  items: Array<{
    coverId: number | null;
    coverStatus: "finished" | "in_progress" | "in_review" | null;
    employeeCnF: integer;
    employeeCnM: integer;
    employeeInF: integer;
    employeeInM: integer;
    employeeJpF: integer;
    employeeJpM: integer;
    employeeKhF: integer;
    employeeKhM: integer;
    employeeLaF: integer;
    employeeLaM: integer;
    employeeMmF: integer;
    employeeMmM: integer;
    employeeOtherF: integer;
    employeeOtherM: integer;
    employeePhF: integer;
    employeePhM: integer;
    employeeThF: integer;
    employeeThM: integer;
    employeeVnF: integer;
    employeeVnM: integer;
    enrollDate: string;
    evalDohId: integer;
    evalMentalId: integer;
    evalOdpcId: integer;
    factoryId: integer;
    factory_name_th: string;
    fileStandard5SUrl: string | null;
    fileStandardHasUrl: string | null;
    fileStandardHcUrl: string | null;
    fileStandardIso14001Url: string | null;
    fileStandardIso45001Url: string | null;
    fileStandardSafetyUrl: string | null;
    fileStandardSanPlusUrl: string | null;
    fileStandardSanUrl: string | null;
    fileStandardTis18001Url: string | null;
    fileStandardWellnessUrl: string | null;
    fileStandardZeroUrl: string | null;
    fiscalYear?: number;  // new
    id: integer;
    provinceId: number;
    region: number;
    safetyOfficerEmail: string | null;
    safetyOfficerFirstName: string;
    safetyOfficerLastName: string;
    safetyOfficerLineId: string | null;
    safetyOfficerPhone: string | null;
    safetyOfficerPosition: string;
    safetyOfficerPrefix: string;
    standard5S: boolean;
    standardHas: boolean;
    standardHc: boolean;
    standardIso14001: boolean;
    standardIso45001: boolean;
    standardSafety: boolean;
    standardSan: boolean;
    standardSanPlus: boolean;
    standardTis18001: boolean;
    standardWellness: boolean;
    standardZero: boolean;
  }>;
  meta: {
    limit: string | integer;
    page: string | integer;
    total: string | integer;
    totalPages: string | integer;
  };
}
```

---

## `GET /admins/factories`

**Changed:** added query `fiscalYear` · response 200: `items[]/fiscalYear`

**Parameters**

| Name | In | Type | Required | Notes |
|---|---|---|---|---|
| `validated` | query | boolean | yes |   |
| `enrolled` | query | boolean | no |   |
| `page` | query | number | no |  1-indexed page number. The first page is 1. |
| `limit` | query | number | no |  Items per page. Max 100. |
| `fiscalYear` | query | number | no | **New.** Common Era fiscal year, labelled by its ending year (2026 = 1 Oct 2025 - 30 Sep 2026). Omit for the current fiscal year. Clients render Buddhist Era as this value + 543. |

**Request body**

none

**Response body**

`200`

```ts
{
  items: Array<{
    account_id: number;
    address_no: string;
    district_name_th: string | null;
    email: string;
    factory_type: number;
    fax_number: string | null;
    fiscalYear?: number;  // new
    is_validate: boolean;
    name_en: string;
    name_th: string;
    phone_number: string;
    province_name_th: string | null;
    road: string | null;
    soi: string | null;
    subdistrict_name_th: string | null;
    tsic_code: string;
    username: string;
    zipcode: string;
  }>;
  meta: {
    limit: string | integer;
    page: string | integer;
    total: string | integer;
    totalPages: string | integer;
  };
}
```

---

## `GET /admins/score`

**Changed:** added query `fiscalYear` · response 200: `items[]/grade` · response 200: `items[]/fiscalYear`

**Parameters**

| Name | In | Type | Required | Notes |
|---|---|---|---|---|
| `region` | query | number | no |   |
| `provinceId` | query | number | no |   |
| `page` | query | number | no |  1-indexed page number. The first page is 1. |
| `limit` | query | number | no |  Items per page. Max 100. |
| `fiscalYear` | query | number | no | **New.** Common Era fiscal year, labelled by its ending year (2026 = 1 Oct 2025 - 30 Sep 2026). Omit for the current fiscal year. Clients render Buddhist Era as this value + 543. |

**Request body**

none

**Response body**

`200`

```ts
{
  items: Array<{
    coverId: number;
    coverStatus: string;
    enrollId: number;
    factoryId: number;
    factoryNameTh: string;
    fiscalYear?: number;  // new
    grade?: "consec-gold" | "gold" | "silver" | "certificate" | "joined" | null;
    scoring: {
      collaborate: {
        achievedScore: string | integer;
        maxScore: string | integer;
        percentage: string | integer;
        scoredCount: string | integer;
      };
      disease: {
        achievedScore: string | integer;
        maxScore: string | integer;
        percentage: string | integer;
        scoredCount: string | integer;
      };
      mental: {
        achievedScore: string | integer;
        maxScore: string | integer;
        percentage: string | integer;
        scoredCount: string | integer;
      };
      outcome: {
        achievedScore: string | integer;
        maxScore: string | integer;
        percentage: string | integer;
        scoredCount: string | integer;
      };
      safety: {
        achievedScore: string | integer;
        maxScore: string | integer;
        percentage: string | integer;
        scoredCount: string | integer;
      };
      total: {
        achievedScore: string | integer;
        maxScore: string | integer;
        percentage: string | integer;
        scoredCount: string | integer;
      };
    };
  }>;
  meta: {
    limit: string | integer;
    page: string | integer;
    total: string | integer;
    totalPages: string | integer;
  };
}
```

---

## `POST /evaluators/covers/{coverId}/finalize`

**Changed:** response 200: `grade`

**Parameters**

| Name | In | Type | Required | Notes |
|---|---|---|---|---|
| `coverId` | path | number | yes |   |

**Request body**

`application/json` (unchanged)

```ts
object
```

**Response body**

`200`

```ts
{
  coverStatus: string;
  grade: "consec-gold" | "gold" | "silver" | "certificate" | "joined" | null;
  message: string /* e.g. "cover finalized" */;
}
```

`400` (unchanged)

```ts
{
  message: string;
}
```

`403` (unchanged)

```ts
{
  message: string;
}
```

`404` (unchanged)

```ts
{
  message: string /* e.g. "cover not found" */;
}
```

`500` (unchanged)

```ts
{
  message: string;
}
```

---

## `GET /evaluators/enrolls`

**Changed:** added query `fiscalYear` · response 200: `items[]/fiscalYear`

**Parameters**

| Name | In | Type | Required | Notes |
|---|---|---|---|---|
| `coverStatus` | query | "finished" \| "in_progress" \| "in_review" \| "none" | no |   |
| `page` | query | number | no |  1-indexed page number. The first page is 1. |
| `limit` | query | number | no |  Items per page. Max 100. |
| `fiscalYear` | query | number | no | **New.** Common Era fiscal year, labelled by its ending year (2026 = 1 Oct 2025 - 30 Sep 2026). Omit for the current fiscal year. Clients render Buddhist Era as this value + 543. |

**Request body**

none

**Response body**

`200`

```ts
{
  items: Array<{
    coverId: number | null;
    coverStatus: "finished" | "in_progress" | "in_review" | null;
    employeeCnF: integer;
    employeeCnM: integer;
    employeeInF: integer;
    employeeInM: integer;
    employeeJpF: integer;
    employeeJpM: integer;
    employeeKhF: integer;
    employeeKhM: integer;
    employeeLaF: integer;
    employeeLaM: integer;
    employeeMmF: integer;
    employeeMmM: integer;
    employeeOtherF: integer;
    employeeOtherM: integer;
    employeePhF: integer;
    employeePhM: integer;
    employeeThF: integer;
    employeeThM: integer;
    employeeVnF: integer;
    employeeVnM: integer;
    enrollDate: string;
    evalDohId: integer;
    evalMentalId: integer;
    evalOdpcId: integer;
    factoryId: integer;
    factory_name_th: string;
    fileStandard5SUrl: string | null;
    fileStandardHasUrl: string | null;
    fileStandardHcUrl: string | null;
    fileStandardIso14001Url: string | null;
    fileStandardIso45001Url: string | null;
    fileStandardSafetyUrl: string | null;
    fileStandardSanPlusUrl: string | null;
    fileStandardSanUrl: string | null;
    fileStandardTis18001Url: string | null;
    fileStandardWellnessUrl: string | null;
    fileStandardZeroUrl: string | null;
    fiscalYear?: number;  // new
    id: integer;
    provinceId: number;
    region: number;
    safetyOfficerEmail: string | null;
    safetyOfficerFirstName: string;
    safetyOfficerLastName: string;
    safetyOfficerLineId: string | null;
    safetyOfficerPhone: string | null;
    safetyOfficerPosition: string;
    safetyOfficerPrefix: string;
    standard5S: boolean;
    standardHas: boolean;
    standardHc: boolean;
    standardIso14001: boolean;
    standardIso45001: boolean;
    standardSafety: boolean;
    standardSan: boolean;
    standardSanPlus: boolean;
    standardTis18001: boolean;
    standardWellness: boolean;
    standardZero: boolean;
  }>;
  meta: {
    limit: string | integer;
    page: string | integer;
    total: string | integer;
    totalPages: string | integer;
  };
}
```

`404` (unchanged)

```ts
{
  message: string /* e.g. "invalid evaluator" */;
}
```

---

## `GET /evaluators/factories`

**Changed:** added query `fiscalYear` · response 200: `items[]/fiscalYear`

**Parameters**

| Name | In | Type | Required | Notes |
|---|---|---|---|---|
| `validated` | query | boolean | yes |   |
| `enrolled` | query | boolean | no |   |
| `page` | query | number | no |  1-indexed page number. The first page is 1. |
| `limit` | query | number | no |  Items per page. Max 100. |
| `fiscalYear` | query | number | no | **New.** Common Era fiscal year, labelled by its ending year (2026 = 1 Oct 2025 - 30 Sep 2026). Omit for the current fiscal year. Clients render Buddhist Era as this value + 543. |

**Request body**

none

**Response body**

`200`

```ts
{
  items: Array<{
    account_id: number;
    address_no: string;
    district_name_th: string | null;
    factory_type: number;
    fax_number: string | null;
    fiscalYear?: number;  // new
    is_validate: boolean;
    name_en: string;
    name_th: string;
    phone_number: string;
    province_name_th: string | null;
    road: string | null;
    soi: string | null;
    subdistrict_name_th: string | null;
    tsic_code: string;
    zipcode: string;
  }>;
  meta: {
    limit: string | integer;
    page: string | integer;
    total: string | integer;
    totalPages: string | integer;
  };
}
```

`404` (unchanged)

```ts
{
  message: string /* e.g. "invalid evaluator" */;
}
```

---

## `GET /evaluators/score`

**Changed:** added query `fiscalYear` · response 200: `items[]/grade` · response 200: `items[]/fiscalYear`

**Parameters**

| Name | In | Type | Required | Notes |
|---|---|---|---|---|
| `page` | query | number | no |  1-indexed page number. The first page is 1. |
| `limit` | query | number | no |  Items per page. Max 100. |
| `fiscalYear` | query | number | no | **New.** Common Era fiscal year, labelled by its ending year (2026 = 1 Oct 2025 - 30 Sep 2026). Omit for the current fiscal year. Clients render Buddhist Era as this value + 543. |

**Request body**

none

**Response body**

`200`

```ts
{
  items: Array<{
    coverId: number;
    coverStatus: string;
    enrollId: number;
    factoryId: number;
    factoryNameTh: string;
    fiscalYear?: number;  // new
    grade?: "consec-gold" | "gold" | "silver" | "certificate" | "joined" | null;
    scoring: {
      collaborate: {
        achievedScore: string | integer;
        maxScore: string | integer;
        percentage: string | integer;
        scoredCount: string | integer;
      };
      disease: {
        achievedScore: string | integer;
        maxScore: string | integer;
        percentage: string | integer;
        scoredCount: string | integer;
      };
      mental: {
        achievedScore: string | integer;
        maxScore: string | integer;
        percentage: string | integer;
        scoredCount: string | integer;
      };
      outcome: {
        achievedScore: string | integer;
        maxScore: string | integer;
        percentage: string | integer;
        scoredCount: string | integer;
      };
      safety: {
        achievedScore: string | integer;
        maxScore: string | integer;
        percentage: string | integer;
        scoredCount: string | integer;
      };
      total: {
        achievedScore: string | integer;
        maxScore: string | integer;
        percentage: string | integer;
        scoredCount: string | integer;
      };
    };
  }>;
  meta: {
    limit: string | integer;
    page: string | integer;
    total: string | integer;
    totalPages: string | integer;
  };
}
```

`404` (unchanged)

```ts
{
  message: string /* e.g. "invalid evaluator" */;
}
```

---

## `GET /factories/assessments/answers`

**Changed:** added query `fiscalYear`

**Parameters**

| Name | In | Type | Required | Notes |
|---|---|---|---|---|
| `fiscalYear` | query | number | no | **New.** Common Era fiscal year, labelled by its ending year (2026 = 1 Oct 2025 - 30 Sep 2026). Omit for the current fiscal year. Clients render Buddhist Era as this value + 543. |

**Request body**

none

**Response body**

`200` (unchanged)

```ts
Array<{
  coverId: integer;
  description: string | null;
  fileUrl1_1: string | null;
  fileUrl1_2: string | null;
  fileUrl1_3: string | null;
  fileUrl2_1: string | null;
  fileUrl2_2: string | null;
  fileUrl2_3: string | null;
  fileUrl3_1: string | null;
  fileUrl3_2: string | null;
  fileUrl3_3: string | null;
  questionId: integer;
  selectedChoice: "0" | "1" | "2" | "3" | "n/a";
  status: string;
  verdictChoice: string | null;
}>
```

`404` (unchanged)

```ts
{
  message: string /* e.g. "answers not found" */;
}
```

---

## `PATCH /factories/assessments/answers`

**Changed:** added query `fiscalYear`

**Parameters**

| Name | In | Type | Required | Notes |
|---|---|---|---|---|
| `fiscalYear` | query | number | no | **New.** Common Era fiscal year, labelled by its ending year (2026 = 1 Oct 2025 - 30 Sep 2026). Omit for the current fiscal year. Clients render Buddhist Era as this value + 543. |

**Request body**

`multipart/form-data` (unchanged)

```ts
{
  file_1_1?: File;
  file_1_2?: File;
  file_1_3?: File;
  file_2_1?: File;
  file_2_2?: File;
  file_2_3?: File;
  file_3_1?: File;
  file_3_2?: File;
  file_3_3?: File;
  questionId: number;
  selectedChoice?: "0" | "1" | "2" | "3" | "n/a";
}
```

**Response body**

`200` (unchanged)

```ts
{
  message: string /* e.g. "answer update" */;
}
```

`400` (unchanged)

```ts
{
  message: string /* e.g. "answer cannot be updated in its current status" */;
} | {
  message: string /* e.g. "standard question does not accept files" */;
} | {
  message: string /* e.g. "choice 1 requires at least file_1_1" */;
} | {
  message: string /* e.g. "choice 2 requires at least file_1_1 and file_2_1" */;
} | {
  message: string /* e.g. "choice 3 requires at least file_1_1, file_2_1, and file_3_1" */;
}
```

`404` (unchanged)

```ts
{
  message: string /* e.g. "cover not found" */;
} | {
  message: string /* e.g. "question not found" */;
} | {
  message: string /* e.g. "answer not found" */;
} | {
  message: string /* e.g. "standard file not found in enroll" */;
}
```

---

## `POST /factories/assessments/answers`

**Changed:** added query `fiscalYear`

**Parameters**

| Name | In | Type | Required | Notes |
|---|---|---|---|---|
| `fiscalYear` | query | number | no | **New.** Common Era fiscal year, labelled by its ending year (2026 = 1 Oct 2025 - 30 Sep 2026). Omit for the current fiscal year. Clients render Buddhist Era as this value + 543. |

**Request body**

`multipart/form-data` (unchanged)

```ts
{
  file_1_1?: File;
  file_1_2?: File;
  file_1_3?: File;
  file_2_1?: File;
  file_2_2?: File;
  file_2_3?: File;
  file_3_1?: File;
  file_3_2?: File;
  file_3_3?: File;
  questionId: number;
  selectedChoice: "0" | "1" | "2" | "3" | "n/a";
}
```

**Response body**

`201` (unchanged)

```ts
{
  message: string /* e.g. "answer save!" */;
}
```

`400` (unchanged)

```ts
{
  message: string /* e.g. "existed answer" */;
} | {
  message: string /* e.g. "standard question does not accept files" */;
} | {
  message: string /* e.g. "choice 1 requires at least file_1_1" */;
} | {
  message: string /* e.g. "choice 2 requires at least file_1_1 and file_2_1" */;
} | {
  message: string /* e.g. "choice 3 requires at least file_1_1, file_2_1, and file_3_1" */;
}
```

`404` (unchanged)

```ts
{
  message: string /* e.g. "cover not found" */;
} | {
  message: string /* e.g. "question not found" */;
} | {
  message: string /* e.g. "standard file not found in enroll" */;
}
```

---

## `POST /factories/assessments/answers/negotiate`

**Changed:** added query `fiscalYear`

**Parameters**

| Name | In | Type | Required | Notes |
|---|---|---|---|---|
| `fiscalYear` | query | number | no | **New.** Common Era fiscal year, labelled by its ending year (2026 = 1 Oct 2025 - 30 Sep 2026). Omit for the current fiscal year. Clients render Buddhist Era as this value + 543. |

**Request body**

`multipart/form-data` (unchanged)

```ts
{
  action: "accept" | "redo";
  file_1_1?: File;
  file_1_2?: File;
  file_1_3?: File;
  file_2_1?: File;
  file_2_2?: File;
  file_2_3?: File;
  file_3_1?: File;
  file_3_2?: File;
  file_3_3?: File;
  questionId: number;
  selectedChoice?: "0" | "1" | "2" | "3" | "n/a";
}
```

**Response body**

`200` (unchanged)

```ts
{
  message: string /* e.g. "answer accepted" */;
}
```

`400` (unchanged)

```ts
{
  message: string /* e.g. "negotiation only allowed when cover is in progress" */;
} | {
  message: string /* e.g. "answer is not in a state that can be negotiated" */;
} | {
  message: string /* e.g. "hard-rejected answer cannot be accepted; redo instead" */;
} | {
  message: string /* e.g. "choice 1 requires at least file_1_1" */;
}
```

`404` (unchanged)

```ts
{
  message: string /* e.g. "cover not found" */;
} | {
  message: string /* e.g. "question not found" */;
} | {
  message: string /* e.g. "answer not found" */;
}
```

---

## `GET /factories/assessments/covers`

**Changed:** added query `fiscalYear` · response 200: `fiscalYear`

**Parameters**

| Name | In | Type | Required | Notes |
|---|---|---|---|---|
| `fiscalYear` | query | number | no | **New.** Common Era fiscal year, labelled by its ending year (2026 = 1 Oct 2025 - 30 Sep 2026). Omit for the current fiscal year. Clients render Buddhist Era as this value + 543. |

**Request body**

none

**Response body**

`200`

```ts
{
  enrollId: integer;
  fiscalYear?: number;  // new
  id: integer;
  startDate: string;
  status: string;
  update_date: string;
}
```

`404` (unchanged)

```ts
{
  message: string /* e.g. "cover not found" */;
}
```

---

## `GET /factories/assessments/score`

**Changed:** added query `fiscalYear` · response 200: `grade` · response 200: `fiscalYear`

**Parameters**

| Name | In | Type | Required | Notes |
|---|---|---|---|---|
| `fiscalYear` | query | number | no | **New.** Common Era fiscal year, labelled by its ending year (2026 = 1 Oct 2025 - 30 Sep 2026). Omit for the current fiscal year. Clients render Buddhist Era as this value + 543. |

**Request body**

none

**Response body**

`200`

```ts
{
  coverId: number;
  coverStatus: string;
  enrollId: number;
  factoryId: number;
  factoryNameTh: string;
  fiscalYear?: number;  // new
  grade?: "consec-gold" | "gold" | "silver" | "certificate" | "joined" | null;
  scoring: {
    collaborate: {
      achievedScore: string | integer;
      maxScore: string | integer;
      percentage: string | integer;
      scoredCount: string | integer;
    };
    disease: {
      achievedScore: string | integer;
      maxScore: string | integer;
      percentage: string | integer;
      scoredCount: string | integer;
    };
    mental: {
      achievedScore: string | integer;
      maxScore: string | integer;
      percentage: string | integer;
      scoredCount: string | integer;
    };
    outcome: {
      achievedScore: string | integer;
      maxScore: string | integer;
      percentage: string | integer;
      scoredCount: string | integer;
    };
    safety: {
      achievedScore: string | integer;
      maxScore: string | integer;
      percentage: string | integer;
      scoredCount: string | integer;
    };
    total: {
      achievedScore: string | integer;
      maxScore: string | integer;
      percentage: string | integer;
      scoredCount: string | integer;
    };
  };
}
```

`400` (unchanged)

```ts
{
  message: string;
}
```

`404` (unchanged)

```ts
{
  message: string;
}
```

---

## `POST /factories/assessments/submission`

**Changed:** added query `fiscalYear`

**Parameters**

| Name | In | Type | Required | Notes |
|---|---|---|---|---|
| `fiscalYear` | query | number | no | **New.** Common Era fiscal year, labelled by its ending year (2026 = 1 Oct 2025 - 30 Sep 2026). Omit for the current fiscal year. Clients render Buddhist Era as this value + 543. |

**Request body**

none

**Response body**

`200` (unchanged)

```ts
{
  message: string /* e.g. "answers submit" */;
}
```

`400` (unchanged)

```ts
{
  message: string /* e.g. "cover is not in progress" */;
} | {
  message: string /* e.g. "not all questions have been answered" */;
} | {
  message: string /* e.g. "submit blocked: some answers are still rejected" */;
  rejectedAnswerIds?: Array<number>;
}
```

`404` (unchanged)

```ts
{
  message: string /* e.g. "cover not found" */;
}
```

---

## `GET /factories/enrolls`

**Changed:** added query `fiscalYear`

**Parameters**

| Name | In | Type | Required | Notes |
|---|---|---|---|---|
| `fiscalYear` | query | number | no | **New.** Common Era fiscal year, labelled by its ending year (2026 = 1 Oct 2025 - 30 Sep 2026). Omit for the current fiscal year. Clients render Buddhist Era as this value + 543. |

**Request body**

none

**Response body**

---

## `POST /factories/enrolls`

**Changed:** response 400: new message variant

**Request body**

`multipart/form-data` (unchanged)

```ts
{
  employeeCnF: number;
  employeeCnM: number;
  employeeInF: number;
  employeeInM: number;
  employeeJpF: number;
  employeeJpM: number;
  employeeKhF: number;
  employeeKhM: number;
  employeeLaF: number;
  employeeLaM: number;
  employeeMmF: number;
  employeeMmM: number;
  employeeOtherF: number;
  employeeOtherM: number;
  employeePhF: number;
  employeePhM: number;
  employeeThF: number;
  employeeThM: number;
  employeeVnF: number;
  employeeVnM: number;
  fileStandard5S?: File;
  fileStandardHas?: File;
  fileStandardHc?: File;
  fileStandardIso14001?: File;
  fileStandardIso45001?: File;
  fileStandardSafety?: File;
  fileStandardSan?: File;
  fileStandardSanPlus?: File;
  fileStandardTis18001?: File;
  fileStandardWellness?: File;
  fileStandardZero?: File;
  safetyOfficerEmail?: string;
  safetyOfficerFirstName: string;
  safetyOfficerLastName: string;
  safetyOfficerLineId?: string;
  safetyOfficerPhone?: string;
  safetyOfficerPosition: string;
  safetyOfficerPrefix: string;
  standard5S: boolean | "true" | "false";
  standardHas: boolean | "true" | "false";
  standardHc: boolean | "true" | "false";
  standardIso14001: boolean | "true" | "false";
  standardIso45001: boolean | "true" | "false";
  standardSafety: boolean | "true" | "false";
  standardSan: boolean | "true" | "false";
  standardSanPlus: boolean | "true" | "false";
  standardTis18001: boolean | "true" | "false";
  standardWellness: boolean | "true" | "false";
  standardZero: boolean | "true" | "false";
}
```

**Response body**

`201` (unchanged)

```ts
{
  message: string /* e.g. "create enrollment successfully" */;
}
```

`400`

```ts
{
  message: string /* e.g. "standard ... is issue but file is missing" */;
} | {
  message: string /* e.g. "already make an enroll in fiscal year" */;
} | {
  message: string /* e.g. "enrollment is closed after a gold-tier award; next eligible fiscal year is 2028" */;
}
```

---

## `GET /provincialOfficers/enrolls`

**Changed:** added query `fiscalYear` · response 200: `items[]/fiscalYear`

**Parameters**

| Name | In | Type | Required | Notes |
|---|---|---|---|---|
| `coverStatus` | query | "finished" \| "in_progress" \| "in_review" \| "none" | no |   |
| `page` | query | number | no |  1-indexed page number. The first page is 1. |
| `limit` | query | number | no |  Items per page. Max 100. |
| `fiscalYear` | query | number | no | **New.** Common Era fiscal year, labelled by its ending year (2026 = 1 Oct 2025 - 30 Sep 2026). Omit for the current fiscal year. Clients render Buddhist Era as this value + 543. |

**Request body**

none

**Response body**

`200`

```ts
{
  items: Array<{
    coverId: number | null;
    coverStatus: "finished" | "in_progress" | "in_review" | null;
    employeeCnF: integer;
    employeeCnM: integer;
    employeeInF: integer;
    employeeInM: integer;
    employeeJpF: integer;
    employeeJpM: integer;
    employeeKhF: integer;
    employeeKhM: integer;
    employeeLaF: integer;
    employeeLaM: integer;
    employeeMmF: integer;
    employeeMmM: integer;
    employeeOtherF: integer;
    employeeOtherM: integer;
    employeePhF: integer;
    employeePhM: integer;
    employeeThF: integer;
    employeeThM: integer;
    employeeVnF: integer;
    employeeVnM: integer;
    enrollDate: string;
    evalDohId: integer;
    evalMentalId: integer;
    evalOdpcId: integer;
    factoryId: integer;
    factory_name_th: string;
    fileStandard5SUrl: string | null;
    fileStandardHasUrl: string | null;
    fileStandardHcUrl: string | null;
    fileStandardIso14001Url: string | null;
    fileStandardIso45001Url: string | null;
    fileStandardSafetyUrl: string | null;
    fileStandardSanPlusUrl: string | null;
    fileStandardSanUrl: string | null;
    fileStandardTis18001Url: string | null;
    fileStandardWellnessUrl: string | null;
    fileStandardZeroUrl: string | null;
    fiscalYear?: number;  // new
    id: integer;
    provinceId: number;
    region: number;
    safetyOfficerEmail: string | null;
    safetyOfficerFirstName: string;
    safetyOfficerLastName: string;
    safetyOfficerLineId: string | null;
    safetyOfficerPhone: string | null;
    safetyOfficerPosition: string;
    safetyOfficerPrefix: string;
    standard5S: boolean;
    standardHas: boolean;
    standardHc: boolean;
    standardIso14001: boolean;
    standardIso45001: boolean;
    standardSafety: boolean;
    standardSan: boolean;
    standardSanPlus: boolean;
    standardTis18001: boolean;
    standardWellness: boolean;
    standardZero: boolean;
  }>;
  meta: {
    limit: string | integer;
    page: string | integer;
    total: string | integer;
    totalPages: string | integer;
  };
}
```

`404` (unchanged)

```ts
{
  message: string /* e.g. "officer not found" */;
}
```

---

## `GET /provincialOfficers/factories`

**Changed:** added query `fiscalYear` · response 200: `items[]/fiscalYear`

**Parameters**

| Name | In | Type | Required | Notes |
|---|---|---|---|---|
| `validated` | query | boolean | yes |   |
| `enrolled` | query | boolean | no |   |
| `page` | query | number | no |  1-indexed page number. The first page is 1. |
| `limit` | query | number | no |  Items per page. Max 100. |
| `fiscalYear` | query | number | no | **New.** Common Era fiscal year, labelled by its ending year (2026 = 1 Oct 2025 - 30 Sep 2026). Omit for the current fiscal year. Clients render Buddhist Era as this value + 543. |

**Request body**

none

**Response body**

`200`

```ts
{
  items: Array<{
    account_id: number;
    address_no: string;
    district_name_th: string;
    factory_type: number;
    fax_number: string | null;
    fiscalYear?: number;  // new
    is_validate: boolean;
    name_en: string;
    name_th: string;
    phone_number: string;
    province_name_th: string;
    road: string | null;
    soi: string | null;
    subdistrict_name_th: string;
    tsic_code: string;
    zipcode: string;
  }>;
  meta: {
    limit: string | integer;
    page: string | integer;
    total: string | integer;
    totalPages: string | integer;
  };
}
```

`404` (unchanged)

```ts
{
  message: string;
}
```

---

## `GET /provincialOfficers/score`

**Changed:** added query `fiscalYear` · response 200: `items[]/grade` · response 200: `items[]/fiscalYear`

**Parameters**

| Name | In | Type | Required | Notes |
|---|---|---|---|---|
| `page` | query | number | no |  1-indexed page number. The first page is 1. |
| `limit` | query | number | no |  Items per page. Max 100. |
| `fiscalYear` | query | number | no | **New.** Common Era fiscal year, labelled by its ending year (2026 = 1 Oct 2025 - 30 Sep 2026). Omit for the current fiscal year. Clients render Buddhist Era as this value + 543. |

**Request body**

none

**Response body**

`200`

```ts
{
  items: Array<{
    coverId: number;
    coverStatus: string;
    enrollId: number;
    factoryId: number;
    factoryNameTh: string;
    fiscalYear?: number;  // new
    grade?: "consec-gold" | "gold" | "silver" | "certificate" | "joined" | null;
    scoring: {
      collaborate: {
        achievedScore: string | integer;
        maxScore: string | integer;
        percentage: string | integer;
        scoredCount: string | integer;
      };
      disease: {
        achievedScore: string | integer;
        maxScore: string | integer;
        percentage: string | integer;
        scoredCount: string | integer;
      };
      mental: {
        achievedScore: string | integer;
        maxScore: string | integer;
        percentage: string | integer;
        scoredCount: string | integer;
      };
      outcome: {
        achievedScore: string | integer;
        maxScore: string | integer;
        percentage: string | integer;
        scoredCount: string | integer;
      };
      safety: {
        achievedScore: string | integer;
        maxScore: string | integer;
        percentage: string | integer;
        scoredCount: string | integer;
      };
      total: {
        achievedScore: string | integer;
        maxScore: string | integer;
        percentage: string | integer;
        scoredCount: string | integer;
      };
    };
  }>;
  meta: {
    limit: string | integer;
    page: string | integer;
    total: string | integer;
    totalPages: string | integer;
  };
}
```

`404` (unchanged)

```ts
{
  message: string /* e.g. "provincial officer not found" */;
}
```

---
