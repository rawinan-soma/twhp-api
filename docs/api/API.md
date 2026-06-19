# Elysia Documentation

> Version `0.0.0` · OpenAPI `3.0.3` · Generated 2026-06-19

49 operations across 9 groups.

## Contents

- [admin](#admin)
  - [`POST /twhp/api/admin/covers/{coverId}/verdict`](#post-twhp-api-admin-covers-coverid-verdict)
  - [`GET /twhp/api/admin/covers/{coverId}/answers`](#get-twhp-api-admin-covers-coverid-answers)
- [admins](#admins)
  - [`PATCH /twhp/api/admins`](#patch-twhp-api-admins)
  - [`GET /twhp/api/admins/enrolls`](#get-twhp-api-admins-enrolls)
  - [`GET /twhp/api/admins/factories`](#get-twhp-api-admins-factories)
  - [`PATCH /twhp/api/admins/factories/validate/{id}`](#patch-twhp-api-admins-factories-validate-id)
  - [`GET /twhp/api/admins/score`](#get-twhp-api-admins-score)
  - [`GET /twhp/api/admins/enrolls/{id}`](#get-twhp-api-admins-enrolls-id)
  - [`GET /twhp/api/admins/factories/{id}`](#get-twhp-api-admins-factories-id)
  - [`PATCH /twhp/api/admins/factories/{id}`](#patch-twhp-api-admins-factories-id)
  - [`DELETE /twhp/api/admins/factories/{id}`](#delete-twhp-api-admins-factories-id)
- [authentication](#authentication)
  - [`POST /twhp/api/authentication/login`](#post-twhp-api-authentication-login)
  - [`POST /twhp/api/authentication/login/verify-otp`](#post-twhp-api-authentication-login-verify-otp)
  - [`POST /twhp/api/authentication/login/resend-otp`](#post-twhp-api-authentication-login-resend-otp)
  - [`POST /twhp/api/authentication/reset-password-request`](#post-twhp-api-authentication-reset-password-request)
  - [`POST /twhp/api/authentication/reset-password`](#post-twhp-api-authentication-reset-password)
  - [`POST /twhp/api/authentication/logout`](#post-twhp-api-authentication-logout)
  - [`GET /twhp/api/authentication`](#get-twhp-api-authentication)
- [default](#default)
  - [`GET /twhp/api/health`](#get-twhp-api-health)
- [evaluators](#evaluators)
  - [`PATCH /twhp/api/evaluators/password`](#patch-twhp-api-evaluators-password)
  - [`GET /twhp/api/evaluators/enrolls`](#get-twhp-api-evaluators-enrolls)
  - [`GET /twhp/api/evaluators/factories`](#get-twhp-api-evaluators-factories)
  - [`GET /twhp/api/evaluators/score`](#get-twhp-api-evaluators-score)
  - [`GET /twhp/api/evaluators/enrolls/{id}`](#get-twhp-api-evaluators-enrolls-id)
  - [`GET /twhp/api/evaluators/factories/{id}`](#get-twhp-api-evaluators-factories-id)
  - [`POST /twhp/api/evaluators/covers/{coverId}/verdict`](#post-twhp-api-evaluators-covers-coverid-verdict)
  - [`GET /twhp/api/evaluators/covers/{coverId}/answers`](#get-twhp-api-evaluators-covers-coverid-answers)
- [factories](#factories)
  - [`POST /twhp/api/factories/register`](#post-twhp-api-factories-register)
  - [`PATCH /twhp/api/factories`](#patch-twhp-api-factories)
  - [`GET /twhp/api/factories/enrolls`](#get-twhp-api-factories-enrolls)
  - [`POST /twhp/api/factories/enrolls`](#post-twhp-api-factories-enrolls)
  - [`PATCH /twhp/api/factories/enrolls`](#patch-twhp-api-factories-enrolls)
  - [`GET /twhp/api/factories/assessments/covers`](#get-twhp-api-factories-assessments-covers)
  - [`POST /twhp/api/factories/assessments/covers`](#post-twhp-api-factories-assessments-covers)
  - [`GET /twhp/api/factories/assessments/questions`](#get-twhp-api-factories-assessments-questions)
  - [`GET /twhp/api/factories/assessments/answers`](#get-twhp-api-factories-assessments-answers)
  - [`POST /twhp/api/factories/assessments/answers`](#post-twhp-api-factories-assessments-answers)
  - [`PATCH /twhp/api/factories/assessments/answers`](#patch-twhp-api-factories-assessments-answers)
  - [`POST /twhp/api/factories/assessments/answers/negotiate`](#post-twhp-api-factories-assessments-answers-negotiate)
  - [`POST /twhp/api/factories/assessments/submission`](#post-twhp-api-factories-assessments-submission)
  - [`GET /twhp/api/factories/assessments/score`](#get-twhp-api-factories-assessments-score)
- [file](#file)
  - [`GET /twhp/api/file/presigned-url`](#get-twhp-api-file-presigned-url)
- [location](#location)
  - [`GET /twhp/api/location/provinces`](#get-twhp-api-location-provinces)
  - [`GET /twhp/api/location/provinces/{provinceId}/districts`](#get-twhp-api-location-provinces-provinceid-districts)
  - [`GET /twhp/api/location/districts/{districtId}/subdistricts`](#get-twhp-api-location-districts-districtid-subdistricts)
- [provincialOfficers](#provincialofficers)
  - [`PATCH /twhp/api/provincialOfficers/password`](#patch-twhp-api-provincialofficers-password)
  - [`GET /twhp/api/provincialOfficers/enrolls`](#get-twhp-api-provincialofficers-enrolls)
  - [`GET /twhp/api/provincialOfficers/factories`](#get-twhp-api-provincialofficers-factories)
  - [`GET /twhp/api/provincialOfficers/score`](#get-twhp-api-provincialofficers-score)

## admin

### `POST /twhp/api/admin/covers/{coverId}/verdict`


บันทึกคำตัดสินแบบ batch (ผู้ดูแลระบบทำหน้าที่ ODPC ระดับประเทศ, finalize ในหนึ่ง transaction)

**Parameters**

| Name | In | Required | Type | Description |
| --- | --- | --- | --- | --- |
| `coverId` | path | yes | `number` |  |

**Request body** (`application/json`)

```json
{
  "minItems": 1,
  "type": "array",
  "items": {
    "anyOf": [
      {
        "type": "object",
        "required": [
          "answerId",
          "decision"
        ],
        "properties": {
          "answerId": {
            "type": "number"
          },
          "decision": {
            "const": "approve",
            "type": "string"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "answerId",
          "decision",
          "verdictChoice",
          "description"
        ],
        "properties": {
          "answerId": {
            "type": "number"
          },
          "decision": {
            "const": "change_score",
            "type": "string"
          },
          "verdictChoice": {
            "anyOf": [
              {
                "const": "0",
                "type": "string"
              },
              {
                "const": "1",
                "type": "string"
              },
              {
                "const": "2",
                "type": "string"
              },
              {
                "const": "3",
                "type": "string"
              }
            ]
          },
          "description": {
            "minLength": 1,
            "type": "string"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "answerId",
          "decision",
          "description"
        ],
        "properties": {
          "answerId": {
            "type": "number"
          },
          "decision": {
            "const": "reject",
            "type": "string"
          },
          "description": {
            "minLength": 1,
            "type": "string"
          }
        }
      }
    ]
  }
}
```

**Responses**

- `200` — Response for status 200

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |
  | `grade` | `string \| string \| string \| string \| null` | — |  |

- `400` — Response for status 400

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `403` — Response for status 403

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

### `GET /twhp/api/admin/covers/{coverId}/answers`


ดูคำตอบในฝาประเมิน (ผู้ดูแลระบบทำหน้าที่ ODPC ระดับประเทศ ไม่กรองตามภูมิภาค)

**Parameters**

| Name | In | Required | Type | Description |
| --- | --- | --- | --- | --- |
| `coverId` | path | yes | `number` |  |

**Responses**

- `200` — Response for status 200
- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

## admins

### `PATCH /twhp/api/admins`


แก้ไขข้อมูลของ admin

**Request body** (`application/json`)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `accountId` | `integer` | — |  |
| `firstName` | `string` | — |  |
| `lastName` | `string` | — |  |
| `phoneNumber` | `string` | — |  |
| `email` | `string<email>` | — |  |
| `password` | `string` | — |  |

**Responses**

- `200` — Response for status 200

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `400` — Response for status 400

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

### `GET /twhp/api/admins/enrolls`


ดึงข้อมูลการสมัครเข้าร่วมโครงการทั้งหมด

**Responses**

- `200` — Response for status 200

---

### `GET /twhp/api/admins/factories`


ดึงข้อมูล สปก. ทั้งหมด

**Parameters**

| Name | In | Required | Type | Description |
| --- | --- | --- | --- | --- |
| `validated` | query | yes | `boolean` |  |
| `enrolled` | query | — | `boolean` |  |

**Responses**

- `200` — Response for status 200

---

### `PATCH /twhp/api/admins/factories/validate/{id}`


อนุมัติการลงทะเบียน

**Parameters**

| Name | In | Required | Type | Description |
| --- | --- | --- | --- | --- |
| `id` | path | yes | `number` |  |

**Responses**

- `200` — Response for status 200

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `400` — Response for status 400

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

### `GET /twhp/api/admins/score`


ดูคะแนนประเมินโรงงานทั้งหมด (กรองตามเขต/จังหวัดได้)

**Parameters**

| Name | In | Required | Type | Description |
| --- | --- | --- | --- | --- |
| `region` | query | — | `number` |  |
| `provinceId` | query | — | `number` |  |

**Responses**

- `200` — Response for status 200

---

### `GET /twhp/api/admins/enrolls/{id}`


ดึงข้อมูลการสมัครเข้าร่วมโครงการตาม id

**Parameters**

| Name | In | Required | Type | Description |
| --- | --- | --- | --- | --- |
| `id` | path | yes | `number` |  |

**Responses**

- `200` — Response for status 200

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `id` | `integer` | yes |  |
  | `enrollDate` | `string` | yes |  |
  | `factoryId` | `integer` | yes |  |
  | `evalDohId` | `integer` | yes |  |
  | `evalOdpcId` | `integer` | yes |  |
  | `evalMentalId` | `integer` | yes |  |
  | `employeeThM` | `integer` | yes |  |
  | `employeeMmM` | `integer` | yes |  |
  | `employeeKhM` | `integer` | yes |  |
  | `employeeLaM` | `integer` | yes |  |
  | `employeeVnM` | `integer` | yes |  |
  | `employeeCnM` | `integer` | yes |  |
  | `employeePhM` | `integer` | yes |  |
  | `employeeJpM` | `integer` | yes |  |
  | `employeeInM` | `integer` | yes |  |
  | `employeeOtherM` | `integer` | yes |  |
  | `employeeThF` | `integer` | yes |  |
  | `employeeMmF` | `integer` | yes |  |
  | `employeeKhF` | `integer` | yes |  |
  | `employeeLaF` | `integer` | yes |  |
  | `employeeVnF` | `integer` | yes |  |
  | `employeeCnF` | `integer` | yes |  |
  | `employeePhF` | `integer` | yes |  |
  | `employeeJpF` | `integer` | yes |  |
  | `employeeInF` | `integer` | yes |  |
  | `employeeOtherF` | `integer` | yes |  |
  | `standardHc` | `boolean` | yes |  |
  | `fileStandardHcUrl` | `string \| null` | yes |  |
  | `standardSan` | `boolean` | yes |  |
  | `fileStandardSanUrl` | `string \| null` | yes |  |
  | `standardSanPlus` | `boolean` | yes |  |
  | `fileStandardSanPlusUrl` | `string \| null` | yes |  |
  | `standardWellness` | `boolean` | yes |  |
  | `fileStandardWellnessUrl` | `string \| null` | yes |  |
  | `standardSafety` | `boolean` | yes |  |
  | `fileStandardSafetyUrl` | `string \| null` | yes |  |
  | `standardTis18001` | `boolean` | yes |  |
  | `fileStandardTis18001Url` | `string \| null` | yes |  |
  | `standardIso45001` | `boolean` | yes |  |
  | `fileStandardIso45001Url` | `string \| null` | yes |  |
  | `standardIso14001` | `boolean` | yes |  |
  | `fileStandardIso14001Url` | `string \| null` | yes |  |
  | `standardZero` | `boolean` | yes |  |
  | `fileStandardZeroUrl` | `string \| null` | yes |  |
  | `standard5S` | `boolean` | yes |  |
  | `fileStandard5SUrl` | `string \| null` | yes |  |
  | `standardHas` | `boolean` | yes |  |
  | `fileStandardHasUrl` | `string \| null` | yes |  |
  | `safetyOfficerPrefix` | `string` | yes |  |
  | `safetyOfficerFirstName` | `string` | yes |  |
  | `safetyOfficerLastName` | `string` | yes |  |
  | `safetyOfficerPosition` | `string` | yes |  |
  | `safetyOfficerEmail` | `string \| null` | yes |  |
  | `safetyOfficerPhone` | `string \| null` | yes |  |
  | `safetyOfficerLineId` | `string \| null` | yes |  |
  | `province_name_th` | `string \| null` | yes |  |
  | `district_name_th` | `string \| null` | yes |  |
  | `subdistrict_name_th` | `string \| null` | yes |  |

- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

### `GET /twhp/api/admins/factories/{id}`


ดึงข้อมูลสปก. ตาม id

**Parameters**

| Name | In | Required | Type | Description |
| --- | --- | --- | --- | --- |
| `id` | path | yes | `number` |  |

**Responses**

- `200` — Response for status 200

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `account_id` | `number` | yes |  |
  | `factory_type` | `number` | yes |  |
  | `name_th` | `string` | yes |  |
  | `name_en` | `string` | yes |  |
  | `tsic_code` | `string` | yes |  |
  | `address_no` | `string` | yes |  |
  | `soi` | `string \| null` | yes |  |
  | `road` | `string \| null` | yes |  |
  | `zipcode` | `string` | yes |  |
  | `phone_number` | `string` | yes |  |
  | `fax_number` | `string \| null` | yes |  |
  | `province_id` | `number` | yes |  |
  | `district_id` | `number` | yes |  |
  | `subdistrict_id` | `number` | yes |  |
  | `is_validate` | `boolean` | yes |  |
  | `username` | `string` | yes |  |
  | `province_name_th` | `string` | yes |  |
  | `district_name_th` | `string` | yes |  |
  | `subdistrict_name_th` | `string` | yes |  |

- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

### `PATCH /twhp/api/admins/factories/{id}`


update ข้อมูลของ สปก. ตาม id ของสปก.

**Parameters**

| Name | In | Required | Type | Description |
| --- | --- | --- | --- | --- |
| `id` | path | yes | `number` |  |

**Request body** (`application/json`)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `factoryType` | `integer` | — |  |
| `nameTh` | `string` | — |  |
| `nameEn` | `string` | — |  |
| `tsicCode` | `string` | — |  |
| `addressNo` | `string` | — |  |
| `soi` | `string \| null` | — |  |
| `road` | `string \| null` | — |  |
| `zipcode` | `string` | — |  |
| `phoneNumber` | `string` | — |  |
| `faxNumber` | `string \| null` | — |  |
| `subdistrictId` | `integer` | — |  |
| `password` | `string` | — |  |
| `email` | `string<email>` | — |  |

**Responses**

- `200` — Response for status 200

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `400` — Response for status 400

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

### `DELETE /twhp/api/admins/factories/{id}`


ลบข้อมูล สปก.

**Parameters**

| Name | In | Required | Type | Description |
| --- | --- | --- | --- | --- |
| `id` | path | yes | `number` |  |

**Responses**

- `200` — Response for status 200

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

## authentication

### `POST /twhp/api/authentication/login`


Staff/Factory login (step 1)

**Parameters**

| Name | In | Required | Type | Description |
| --- | --- | --- | --- | --- |
| `Authentication` | cookie | — | `string` |  |
| `Refresh` | cookie | — | `string` |  |

**Request body** (`application/json`)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `username` | `string` | yes |  |
| `password` | `string` | yes |  |

**Responses**

- `200` — Login response — check twoFactorRequired to determine path
- `401` — Response for status 401
- `429` — Response for status 429

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `500` — Response for status 500

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

### `POST /twhp/api/authentication/login/verify-otp`


Submit OTP to complete staff login (step 2)

**Parameters**

| Name | In | Required | Type | Description |
| --- | --- | --- | --- | --- |
| `Authentication` | cookie | — | `string` |  |
| `Refresh` | cookie | — | `string` |  |

**Request body** (`application/json`)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `challengeId` | `string` | yes | challengeId from /login step-1 |
| `code` | `string` | yes | 6-digit OTP code from email |

**Responses**

- `200` — Response for status 200

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |
  | `user` | `object` | yes |  |

- `400` — Response for status 400

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `401` — Response for status 401
- `429` — Response for status 429

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `500` — Response for status 500

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

### `POST /twhp/api/authentication/login/resend-otp`


Request OTP resend (60s throttle)

**Request body** (`application/json`)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `challengeId` | `string` | yes | challengeId from /login step-1 |

**Responses**

- `200` — Response for status 200

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `400` — Response for status 400

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `429` — Response for status 429

---

### `POST /twhp/api/authentication/reset-password-request`


ขอ email เพื่อ reset password

**Request body** (`application/json`)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `email` | `string<email>` | yes |  |

**Responses**

- `201` — Response for status 201

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `429` — Response for status 429

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

### `POST /twhp/api/authentication/reset-password`


reset password

**Request body** (`application/json`)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `password` | `string` | yes |  |
| `token` | `string` | yes |  |

**Responses**

- `200` — Response for status 200

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `400` — Response for status 400

---

### `POST /twhp/api/authentication/logout`


logout

**Responses**

- `200` — Response for status 200

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

### `GET /twhp/api/authentication`


ดึงข้อมูล user ของ session ปัจจุบัน

**Responses**

- `200` — Response for status 200

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `id` | `number` | yes |  |
  | `username` | `string` | yes |  |
  | `role` | `string` | yes |  |
  | `change_pw` | `boolean` | yes |  |
  | `eval_level` | `string \| null` | yes |  |
  | `full_name` | `string` | yes |  |

- `400` — Response for status 400

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

## default

### `GET /twhp/api/health`


**Responses**

- `200` — Response for status 200

---

## evaluators

### `PATCH /twhp/api/evaluators/password`


แก้ password ครั้งแรกที่ login

**Request body** (`application/json`)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `password` | `string` | yes |  |
| `email` | `string<email>` | yes |  |

**Responses**

- `200` — Response for status 200

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `400` — Response for status 400
- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

### `GET /twhp/api/evaluators/enrolls`


ดึงข้อมูลการสมัครเข้าร่วมโครงการทั้งหมดตามเขตสุขภาพ

**Responses**

- `200` — Response for status 200
- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

### `GET /twhp/api/evaluators/factories`


ดึงข้อมูลสปก. ทั้งหมดตามเขตสุขภาพ

**Parameters**

| Name | In | Required | Type | Description |
| --- | --- | --- | --- | --- |
| `validated` | query | yes | `boolean` |  |
| `enrolled` | query | — | `boolean` |  |

**Responses**

- `200` — Response for status 200
- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

### `GET /twhp/api/evaluators/score`


ดูคะแนนประเมินโรงงานทั้งหมดในเขตสุขภาพ

**Responses**

- `200` — Response for status 200
- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

### `GET /twhp/api/evaluators/enrolls/{id}`


ดึงข้อมูลการสมัครเข้าร่วมโครงการตาม id

**Parameters**

| Name | In | Required | Type | Description |
| --- | --- | --- | --- | --- |
| `id` | path | yes | `number` |  |

**Responses**

- `200` — Response for status 200

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `id` | `integer` | yes |  |
  | `enrollDate` | `string` | yes |  |
  | `factoryId` | `integer` | yes |  |
  | `evalDohId` | `integer` | yes |  |
  | `evalOdpcId` | `integer` | yes |  |
  | `evalMentalId` | `integer` | yes |  |
  | `employeeThM` | `integer` | yes |  |
  | `employeeMmM` | `integer` | yes |  |
  | `employeeKhM` | `integer` | yes |  |
  | `employeeLaM` | `integer` | yes |  |
  | `employeeVnM` | `integer` | yes |  |
  | `employeeCnM` | `integer` | yes |  |
  | `employeePhM` | `integer` | yes |  |
  | `employeeJpM` | `integer` | yes |  |
  | `employeeInM` | `integer` | yes |  |
  | `employeeOtherM` | `integer` | yes |  |
  | `employeeThF` | `integer` | yes |  |
  | `employeeMmF` | `integer` | yes |  |
  | `employeeKhF` | `integer` | yes |  |
  | `employeeLaF` | `integer` | yes |  |
  | `employeeVnF` | `integer` | yes |  |
  | `employeeCnF` | `integer` | yes |  |
  | `employeePhF` | `integer` | yes |  |
  | `employeeJpF` | `integer` | yes |  |
  | `employeeInF` | `integer` | yes |  |
  | `employeeOtherF` | `integer` | yes |  |
  | `standardHc` | `boolean` | yes |  |
  | `fileStandardHcUrl` | `string \| null` | yes |  |
  | `standardSan` | `boolean` | yes |  |
  | `fileStandardSanUrl` | `string \| null` | yes |  |
  | `standardSanPlus` | `boolean` | yes |  |
  | `fileStandardSanPlusUrl` | `string \| null` | yes |  |
  | `standardWellness` | `boolean` | yes |  |
  | `fileStandardWellnessUrl` | `string \| null` | yes |  |
  | `standardSafety` | `boolean` | yes |  |
  | `fileStandardSafetyUrl` | `string \| null` | yes |  |
  | `standardTis18001` | `boolean` | yes |  |
  | `fileStandardTis18001Url` | `string \| null` | yes |  |
  | `standardIso45001` | `boolean` | yes |  |
  | `fileStandardIso45001Url` | `string \| null` | yes |  |
  | `standardIso14001` | `boolean` | yes |  |
  | `fileStandardIso14001Url` | `string \| null` | yes |  |
  | `standardZero` | `boolean` | yes |  |
  | `fileStandardZeroUrl` | `string \| null` | yes |  |
  | `standard5S` | `boolean` | yes |  |
  | `fileStandard5SUrl` | `string \| null` | yes |  |
  | `standardHas` | `boolean` | yes |  |
  | `fileStandardHasUrl` | `string \| null` | yes |  |
  | `safetyOfficerPrefix` | `string` | yes |  |
  | `safetyOfficerFirstName` | `string` | yes |  |
  | `safetyOfficerLastName` | `string` | yes |  |
  | `safetyOfficerPosition` | `string` | yes |  |
  | `safetyOfficerEmail` | `string \| null` | yes |  |
  | `safetyOfficerPhone` | `string \| null` | yes |  |
  | `safetyOfficerLineId` | `string \| null` | yes |  |
  | `province_name_th` | `string \| null` | yes |  |
  | `district_name_th` | `string \| null` | yes |  |
  | `subdistrict_name_th` | `string \| null` | yes |  |

- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

### `GET /twhp/api/evaluators/factories/{id}`


ดึงข้อมูลสปก. ตาม id

**Parameters**

| Name | In | Required | Type | Description |
| --- | --- | --- | --- | --- |
| `id` | path | yes | `number` |  |

**Responses**

- `200` — Response for status 200

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `account_id` | `number` | yes |  |
  | `factory_type` | `number` | yes |  |
  | `name_th` | `string` | yes |  |
  | `name_en` | `string` | yes |  |
  | `tsic_code` | `string` | yes |  |
  | `address_no` | `string` | yes |  |
  | `soi` | `string \| null` | yes |  |
  | `road` | `string \| null` | yes |  |
  | `zipcode` | `string` | yes |  |
  | `phone_number` | `string` | yes |  |
  | `fax_number` | `string \| null` | yes |  |
  | `province_id` | `number` | yes |  |
  | `district_id` | `number` | yes |  |
  | `subdistrict_id` | `number` | yes |  |
  | `is_validate` | `boolean` | yes |  |
  | `username` | `string` | yes |  |
  | `province_name_th` | `string` | yes |  |
  | `district_name_th` | `string` | yes |  |
  | `subdistrict_name_th` | `string` | yes |  |

- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

### `POST /twhp/api/evaluators/covers/{coverId}/verdict`


บันทึกคำตัดสินแบบ batch (หนึ่ง transaction)

**Parameters**

| Name | In | Required | Type | Description |
| --- | --- | --- | --- | --- |
| `coverId` | path | yes | `number` |  |

**Request body** (`application/json`)

```json
{
  "minItems": 1,
  "type": "array",
  "items": {
    "anyOf": [
      {
        "type": "object",
        "required": [
          "answerId",
          "decision"
        ],
        "properties": {
          "answerId": {
            "type": "number"
          },
          "decision": {
            "const": "approve",
            "type": "string"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "answerId",
          "decision",
          "verdictChoice",
          "description"
        ],
        "properties": {
          "answerId": {
            "type": "number"
          },
          "decision": {
            "const": "change_score",
            "type": "string"
          },
          "verdictChoice": {
            "anyOf": [
              {
                "const": "0",
                "type": "string"
              },
              {
                "const": "1",
                "type": "string"
              },
              {
                "const": "2",
                "type": "string"
              },
              {
                "const": "3",
                "type": "string"
              }
            ]
          },
          "description": {
            "minLength": 1,
            "type": "string"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "answerId",
          "decision",
          "description"
        ],
        "properties": {
          "answerId": {
            "type": "number"
          },
          "decision": {
            "const": "reject",
            "type": "string"
          },
          "description": {
            "minLength": 1,
            "type": "string"
          }
        }
      }
    ]
  }
}
```

**Responses**

- `200` — Response for status 200

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |
  | `grade` | `string \| string \| string \| string \| null` | — |  |

- `400` — Response for status 400

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `403` — Response for status 403

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

### `GET /twhp/api/evaluators/covers/{coverId}/answers`


ดูคำตอบในฝาประเมิน กรองตาม level ของผู้ประเมิน

**Parameters**

| Name | In | Required | Type | Description |
| --- | --- | --- | --- | --- |
| `coverId` | path | yes | `number` |  |

**Responses**

- `200` — Response for status 200
- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

## factories

### `POST /twhp/api/factories/register`


ลงทะเบียนสปก.

**Request body** (`application/json`)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `factoryType` | `integer` | yes |  |
| `nameTh` | `string` | yes |  |
| `nameEn` | `string` | yes |  |
| `tsicCode` | `string` | yes |  |
| `addressNo` | `string` | yes |  |
| `soi` | `string \| null` | — |  |
| `road` | `string \| null` | — |  |
| `zipcode` | `string` | yes |  |
| `phoneNumber` | `string` | yes |  |
| `faxNumber` | `string \| null` | — |  |
| `subdistrictId` | `integer` | yes |  |
| `username` | `string` | yes |  |
| `password` | `string` | yes |  |
| `email` | `string<email>` | yes |  |

**Responses**

- `201` — Response for status 201

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `400` — Response for status 400

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

### `PATCH /twhp/api/factories`


อัปเดตข้อมูลสปก.

**Request body** (`application/json`)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `factoryType` | `integer` | — |  |
| `nameTh` | `string` | — |  |
| `nameEn` | `string` | — |  |
| `tsicCode` | `string` | — |  |
| `addressNo` | `string` | — |  |
| `soi` | `string \| null` | — |  |
| `road` | `string \| null` | — |  |
| `zipcode` | `string` | — |  |
| `phoneNumber` | `string` | — |  |
| `faxNumber` | `string \| null` | — |  |
| `subdistrictId` | `integer` | — |  |
| `password` | `string` | — |  |
| `email` | `string<email>` | — |  |

**Responses**

- `200` — Response for status 200

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `400` — Response for status 400

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

### `GET /twhp/api/factories/enrolls`


ดึงข้อมูลการสมัครเข้าร่วมโครงการของตนเอง

---

### `POST /twhp/api/factories/enrolls`


ลงทะเบียนการสมัครเข้าร่วมโครงการ

**Request body** (`multipart/form-data`)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `employeeThM` | `string<numeric> \| number` | yes |  |
| `employeeMmM` | `string<numeric> \| number` | yes |  |
| `employeeKhM` | `string<numeric> \| number` | yes |  |
| `employeeLaM` | `string<numeric> \| number` | yes |  |
| `employeeVnM` | `string<numeric> \| number` | yes |  |
| `employeeCnM` | `string<numeric> \| number` | yes |  |
| `employeePhM` | `string<numeric> \| number` | yes |  |
| `employeeJpM` | `string<numeric> \| number` | yes |  |
| `employeeInM` | `string<numeric> \| number` | yes |  |
| `employeeOtherM` | `string<numeric> \| number` | yes |  |
| `employeeThF` | `string<numeric> \| number` | yes |  |
| `employeeMmF` | `string<numeric> \| number` | yes |  |
| `employeeKhF` | `string<numeric> \| number` | yes |  |
| `employeeLaF` | `string<numeric> \| number` | yes |  |
| `employeeVnF` | `string<numeric> \| number` | yes |  |
| `employeeCnF` | `string<numeric> \| number` | yes |  |
| `employeePhF` | `string<numeric> \| number` | yes |  |
| `employeeJpF` | `string<numeric> \| number` | yes |  |
| `employeeInF` | `string<numeric> \| number` | yes |  |
| `employeeOtherF` | `string<numeric> \| number` | yes |  |
| `standardHc` | `boolean \| string \| string` | yes |  |
| `standardSan` | `boolean \| string \| string` | yes |  |
| `standardSanPlus` | `boolean \| string \| string` | yes |  |
| `standardWellness` | `boolean \| string \| string` | yes |  |
| `standardSafety` | `boolean \| string \| string` | yes |  |
| `standardTis18001` | `boolean \| string \| string` | yes |  |
| `standardIso45001` | `boolean \| string \| string` | yes |  |
| `standardIso14001` | `boolean \| string \| string` | yes |  |
| `standardZero` | `boolean \| string \| string` | yes |  |
| `standard5S` | `boolean \| string \| string` | yes |  |
| `standardHas` | `boolean \| string \| string` | yes |  |
| `safetyOfficerPrefix` | `string` | yes |  |
| `safetyOfficerFirstName` | `string` | yes |  |
| `safetyOfficerLastName` | `string` | yes |  |
| `safetyOfficerPosition` | `string` | yes |  |
| `safetyOfficerEmail` | `string` | — |  |
| `safetyOfficerPhone` | `string` | — |  |
| `safetyOfficerLineId` | `string` | — |  |
| `fileStandardHc` | `string<binary>` | — |  |
| `fileStandardSan` | `string<binary>` | — |  |
| `fileStandardSanPlus` | `string<binary>` | — |  |
| `fileStandardWellness` | `string<binary>` | — |  |
| `fileStandardSafety` | `string<binary>` | — |  |
| `fileStandardTis18001` | `string<binary>` | — |  |
| `fileStandardIso45001` | `string<binary>` | — |  |
| `fileStandardIso14001` | `string<binary>` | — |  |
| `fileStandardZero` | `string<binary>` | — |  |
| `fileStandard5S` | `string<binary>` | — |  |
| `fileStandardHas` | `string<binary>` | — |  |

**Responses**

- `201` — Response for status 201

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `400` — Response for status 400

---

### `PATCH /twhp/api/factories/enrolls`


อัปเดตข้อมูลการสมัครเข้าร่วมโครงการ

**Request body** (`multipart/form-data`)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `employeeThM` | `string<numeric> \| number` | — |  |
| `employeeMmM` | `string<numeric> \| number` | — |  |
| `employeeKhM` | `string<numeric> \| number` | — |  |
| `employeeLaM` | `string<numeric> \| number` | — |  |
| `employeeVnM` | `string<numeric> \| number` | — |  |
| `employeeCnM` | `string<numeric> \| number` | — |  |
| `employeePhM` | `string<numeric> \| number` | — |  |
| `employeeJpM` | `string<numeric> \| number` | — |  |
| `employeeInM` | `string<numeric> \| number` | — |  |
| `employeeOtherM` | `string<numeric> \| number` | — |  |
| `employeeThF` | `string<numeric> \| number` | — |  |
| `employeeMmF` | `string<numeric> \| number` | — |  |
| `employeeKhF` | `string<numeric> \| number` | — |  |
| `employeeLaF` | `string<numeric> \| number` | — |  |
| `employeeVnF` | `string<numeric> \| number` | — |  |
| `employeeCnF` | `string<numeric> \| number` | — |  |
| `employeePhF` | `string<numeric> \| number` | — |  |
| `employeeJpF` | `string<numeric> \| number` | — |  |
| `employeeInF` | `string<numeric> \| number` | — |  |
| `employeeOtherF` | `string<numeric> \| number` | — |  |
| `standardHc` | `boolean \| string \| string` | — |  |
| `standardSan` | `boolean \| string \| string` | — |  |
| `standardSanPlus` | `boolean \| string \| string` | — |  |
| `standardWellness` | `boolean \| string \| string` | — |  |
| `standardSafety` | `boolean \| string \| string` | — |  |
| `standardTis18001` | `boolean \| string \| string` | — |  |
| `standardIso45001` | `boolean \| string \| string` | — |  |
| `standardIso14001` | `boolean \| string \| string` | — |  |
| `standardZero` | `boolean \| string \| string` | — |  |
| `standard5S` | `boolean \| string \| string` | — |  |
| `standardHas` | `boolean \| string \| string` | — |  |
| `safetyOfficerPrefix` | `string` | — |  |
| `safetyOfficerFirstName` | `string` | — |  |
| `safetyOfficerLastName` | `string` | — |  |
| `safetyOfficerPosition` | `string` | — |  |
| `safetyOfficerEmail` | `string<email>` | — |  |
| `safetyOfficerPhone` | `string` | — |  |
| `safetyOfficerLineId` | `string` | — |  |
| `fileStandardHc` | `string<binary>` | — |  |
| `fileStandardSan` | `string<binary>` | — |  |
| `fileStandardSanPlus` | `string<binary>` | — |  |
| `fileStandardWellness` | `string<binary>` | — |  |
| `fileStandardSafety` | `string<binary>` | — |  |
| `fileStandardTis18001` | `string<binary>` | — |  |
| `fileStandardIso45001` | `string<binary>` | — |  |
| `fileStandardIso14001` | `string<binary>` | — |  |
| `fileStandardZero` | `string<binary>` | — |  |
| `fileStandard5S` | `string<binary>` | — |  |
| `fileStandardHas` | `string<binary>` | — |  |

**Responses**

- `200` — Response for status 200

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `400` — Response for status 400

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes | Standard = true but no file |

- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

### `GET /twhp/api/factories/assessments/covers`


เรียกดูข้อมูลหน้าปกแบบประเมินพร้อมสถานะล่าสุด

**Responses**

- `200` — Response for status 200

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `id` | `integer` | yes |  |
  | `enrollId` | `integer` | yes |  |
  | `startDate` | `string` | yes |  |
  | `status` | `string` | yes |  |
  | `update_date` | `string` | yes |  |

- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

### `POST /twhp/api/factories/assessments/covers`


สร้างแบบประเมินตนเอง

**Responses**

- `201` — Response for status 201

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `400` — Response for status 400

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes | if factory do not enroll yet |


---

### `GET /twhp/api/factories/assessments/questions`


ดึงข้อมูลคำถาม

**Responses**

- `200` — Response for status 200

---

### `GET /twhp/api/factories/assessments/answers`


ดึงข้อมูลคำตอบ

**Responses**

- `200` — Response for status 200
- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

### `POST /twhp/api/factories/assessments/answers`


บันทึกคำตอบ

**Request body** (`multipart/form-data`)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `questionId` | `string<numeric> \| number` | yes |  |
| `selectedChoice` | `"0" \| "1" \| "2" \| "3" \| "n/a"` | yes |  |
| `file_1_1` | `string<binary>` | — |  |
| `file_1_2` | `string<binary>` | — |  |
| `file_1_3` | `string<binary>` | — |  |
| `file_2_1` | `string<binary>` | — |  |
| `file_2_2` | `string<binary>` | — |  |
| `file_2_3` | `string<binary>` | — |  |
| `file_3_1` | `string<binary>` | — |  |
| `file_3_2` | `string<binary>` | — |  |
| `file_3_3` | `string<binary>` | — |  |

**Responses**

- `201` — Response for status 201

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `400` — Response for status 400
- `404` — Response for status 404

---

### `PATCH /twhp/api/factories/assessments/answers`


แก้ไขคำตอบของแบบประเมิน

**Request body** (`multipart/form-data`)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `questionId` | `string<numeric> \| number` | yes |  |
| `selectedChoice` | `"0" \| "1" \| "2" \| "3" \| "n/a"` | — |  |
| `file_1_1` | `string<binary>` | — |  |
| `file_1_2` | `string<binary>` | — |  |
| `file_1_3` | `string<binary>` | — |  |
| `file_2_1` | `string<binary>` | — |  |
| `file_2_2` | `string<binary>` | — |  |
| `file_2_3` | `string<binary>` | — |  |
| `file_3_1` | `string<binary>` | — |  |
| `file_3_2` | `string<binary>` | — |  |
| `file_3_3` | `string<binary>` | — |  |

**Responses**

- `200` — Response for status 200

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `400` — Response for status 400
- `404` — Response for status 404

---

### `POST /twhp/api/factories/assessments/answers/negotiate`


รับหรือปฏิเสธคำตัดสินของผู้ตรวจประเมิน (accept/redo)

**Request body** (`multipart/form-data`)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `action` | `"accept" \| "redo"` | yes |  |
| `questionId` | `string<numeric> \| number` | yes |  |
| `selectedChoice` | `"0" \| "1" \| "2" \| "3" \| "n/a"` | — |  |
| `file_1_1` | `string<binary>` | — |  |
| `file_1_2` | `string<binary>` | — |  |
| `file_1_3` | `string<binary>` | — |  |
| `file_2_1` | `string<binary>` | — |  |
| `file_2_2` | `string<binary>` | — |  |
| `file_2_3` | `string<binary>` | — |  |
| `file_3_1` | `string<binary>` | — |  |
| `file_3_2` | `string<binary>` | — |  |
| `file_3_3` | `string<binary>` | — |  |

**Responses**

- `200` — Response for status 200

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `400` — Response for status 400
- `404` — Response for status 404

---

### `POST /twhp/api/factories/assessments/submission`


ส่งคำตอบทั้งชุด

**Responses**

- `200` — Response for status 200

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `400` — Response for status 400
- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes | No assessment cover exists for the factory's current fiscal year enrollment |


---

### `GET /twhp/api/factories/assessments/score`


ดูคะแนนประเมินตนเองของโรงงาน

**Responses**

- `200` — Response for status 200

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `factoryId` | `number` | yes |  |
  | `factoryNameTh` | `string` | yes |  |
  | `coverId` | `number` | yes |  |
  | `coverStatus` | `string` | yes |  |
  | `enrollId` | `number` | yes |  |
  | `grade` | `string \| string \| string \| string \| null` | — |  |
  | `scoring` | `object` | yes |  |

- `400` — Response for status 400

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

## file

### `GET /twhp/api/file/presigned-url`


Get a 5-minute presigned URL for a stored file

**Parameters**

| Name | In | Required | Type | Description |
| --- | --- | --- | --- | --- |
| `fileName` | query | yes | `string` |  |

**Responses**

- `200` — Response for status 200

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `url` | `string` | yes |  |

- `400` — Response for status 400

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

## location

### `GET /twhp/api/location/provinces`


ดึงข้อมูลจังหวัด

**Responses**

- `200` — Response for status 200

---

### `GET /twhp/api/location/provinces/{provinceId}/districts`


ดึงข้อมูลอำเภอ

**Parameters**

| Name | In | Required | Type | Description |
| --- | --- | --- | --- | --- |
| `provinceId` | path | yes | `string<numeric> \| number` |  |

**Responses**

- `200` — Response for status 200

---

### `GET /twhp/api/location/districts/{districtId}/subdistricts`


ดึงข้อมูลตำบล

**Parameters**

| Name | In | Required | Type | Description |
| --- | --- | --- | --- | --- |
| `districtId` | path | yes | `string<numeric> \| number` |  |

**Responses**

- `200` — Response for status 200

---

## provincialOfficers

### `PATCH /twhp/api/provincialOfficers/password`


เปลี่ยนรหัสผ่านในครั้งแรกที่ login

**Request body** (`application/json`)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `password` | `string` | yes |  |
| `email` | `string<email>` | yes |  |

**Responses**

- `200` — Response for status 200

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |

- `400` — Response for status 400
- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

### `GET /twhp/api/provincialOfficers/enrolls`


ดึงข้อมูลการสมัครเข้าร่วมโครงการทั้งหมดของจังหวัด

**Responses**

- `200` — Response for status 200
- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

### `GET /twhp/api/provincialOfficers/factories`


ดึงข้อมูลโรงงานทั้งหมดในจังหวัด

**Parameters**

| Name | In | Required | Type | Description |
| --- | --- | --- | --- | --- |
| `validated` | query | yes | `boolean` |  |
| `enrolled` | query | — | `boolean` |  |

**Responses**

- `200` — Response for status 200
- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---

### `GET /twhp/api/provincialOfficers/score`


ดูคะแนนประเมินโรงงานทั้งหมดในจังหวัด

**Responses**

- `200` — Response for status 200
- `404` — Response for status 404

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | `string` | yes |  |


---
