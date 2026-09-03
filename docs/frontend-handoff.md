# สรุป API สำหรับทีม Frontend

**Branch:** `dev` · **สแกนเมื่อ:** 26 ส.ค. 2026 · **อ้างอิง:** ADR-0006 → 0012, intent 009 / 012

สแกน 51 operations เทียบกับ `docs/api/openapi.json` ที่ commit ไว้ในรีโป พบเปลี่ยน 9 ตัว
บวกกับพฤติกรรมอีกชุดที่ไม่ปรากฏใน spec เลย

---

## ⚠️ เอกสาร OpenAPI ในรีโปล้าสมัย — อย่าใช้เป็นแหล่งอ้างอิง

`docs/api/openapi.json` ถูก generate ครั้งสุดท้ายเมื่อ **20 commits ที่แล้ว** (`e4f226d`)
ก่อนงาน pagination ทั้งก้อน ถ้าทีมยึดไฟล์นี้อยู่ **ทุกอย่างใน § 1 จะหายไปจากสายตา**
ควร regenerate ก่อนส่งต่อ:

```bash
bun scripts/gen-api-docs.ts
```

**ผลสแกนเทียบไฟล์นั้นกับ dev ที่รันจริง:**

| | |
|---|---|
| operations ทั้งหมด | 51 |
| เปลี่ยน | **9** (list endpoint ที่ถูกห่อด้วย pagination) |
| path เพิ่ม / หาย | **0** |
| request body เปลี่ยน | **0** (ตรวจครบทั้ง 20 endpoint ที่รับ body) |

**ข้อควรระวังที่สุด:** การเปลี่ยนแปลงใน § 2–3 *ไม่ปรากฏใน spec เลย* เพราะเป็นความหมายของค่า
ไม่ใช่รูปร่าง generate client ใหม่แล้วจะ compile ผ่านหมด TypeScript ไม่เตือนอะไร ต้องไล่แก้ด้วยมือ

---

## § 1 — List endpoint ทั้ง 9 ตัวถูกห่อด้วย pagination envelope 🔴 BREAKING

การเปลี่ยนแปลงเดียวที่ปรากฏใน spec และเป็นตัวที่พังก่อนเพื่อน

| เดิม | ใหม่ |
|---|---|
| bare array — `[ {...}, {...} ]` วน `.map()` ได้เลย | envelope — `{ items, meta }` ต้องอ่านผ่าน `.items` |

```jsonc
{
  "items": [ /* ของเดิมที่เคยเป็น response ทั้งก้อน */ ],
  "meta": {
    "page": 1,          // page ที่ใช้จริง รวม default แล้ว
    "limit": 20,        // limit ที่ใช้จริง
    "total": 128,       // แถวทั้งหมดที่ match filter — ไม่ใช่จำนวนใน items
    "totalPages": 7     // ceil(total/limit); เป็น 0 เมื่อ total = 0
  }
}
```

### Endpoint ที่ได้รับผลกระทบ

| Endpoint | Query เดิม (ยังอยู่ครบ) | Item |
|---|---|---|
| `GET /twhp/api/admins/factories` | `validated`, `enrolled` | 17 fields |
| `GET /twhp/api/admins/enrolls` | `coverStatus` | 60 fields |
| `GET /twhp/api/admins/score` | `region`, `provinceId` | 7 fields |
| `GET /twhp/api/evaluators/factories` | `validated`, `enrolled` | 15 fields |
| `GET /twhp/api/evaluators/enrolls` | `coverStatus` | 60 fields |
| `GET /twhp/api/evaluators/score` | — | 7 fields |
| `GET /twhp/api/provincialOfficers/factories` | `validated`, `enrolled` | 15 fields |
| `GET /twhp/api/provincialOfficers/enrolls` | `coverStatus` | 60 fields |
| `GET /twhp/api/provincialOfficers/score` | — | 7 fields |

`page` กับ `limit` ถูก *compose เพิ่ม* ไม่ได้แทนที่ — filter เดิมส่งได้เหมือนเดิมทุกตัว

### กติกาของ query

- `page` เริ่มที่ **1** ไม่ใช่ 0 — ไม่ส่งมา default `1`
- `limit` default **20** เพดาน **100** — เกินนี้ถูก reject ตั้งแต่ก่อนแตะ database
- ทศนิยมอย่าง `?limit=1.5` ถูก reject ต้องเป็นจำนวนเต็ม
- ขอหน้าที่เลยหน้าสุดท้าย **ไม่ใช่ error** — ได้ `200` พร้อม `items: []` และ `meta` ที่ถูกต้อง

### สองอย่างที่พลาดกันบ่อย

- **`total` ไม่ใช่ `items.length`** — ใช้ตัวนี้ทำ pager ไม่ใช่ความยาว array
- **404 ไม่ถูกห่อ** — เมื่อ `evaluators` / `provincialOfficers` resolve ตัวผู้ใช้ไม่ได้
  body ยังเป็น `{ "message": "..." }` เปล่า ๆ ไม่มี `items`/`meta` อย่า parse ด้วย type เดียวกับ 200

endpoint ที่ผลลัพธ์ไม่โตตามข้อมูล (`/questions`, คำตอบราย cover, lookup จังหวัด/อำเภอ)
**ยังเป็น bare array เหมือนเดิม** — envelope นี้ใช้กับ 9 ตัวข้างบนเท่านั้น ไม่ใช่ global wrapper (ADR-0007)

---

## § 2 — การปรับคะแนนกลายเป็นคำตัดสินสุดท้าย 🔴 BREAKING

ไม่ปรากฏใน OpenAPI เลย — shape เดิมทุกตัว เปลี่ยนแค่ความหมาย
เดิมปรับคะแนนแล้วเด้งกลับให้โรงงาน accept/redo (ADR-0004) ตอนนี้จบทันที (ADR-0012)

| เดิม | ใหม่ |
|---|---|
| `change_score` → `rejected` → cover เด้งเป็น `in_progress` → โรงงานกด accept → `negotiate` เขียนคะแนน | `change_score` → `recommended` → cover ไม่เด้ง → โรงงานเห็นแบบ read-only → `finalize` เขียนคะแนน |

### `POST /twhp/api/evaluators/covers/:coverId/answers/:answerId/verdict`

> alias เดียวกัน: `/twhp/api/admins/covers/:coverId/answers/:answerId/verdict`

body และ response **เหมือนเดิมทุกฟิลด์** แต่ค่าที่ได้ใน `status` เปลี่ยน:
ส่ง `decision: "change_score"` จะได้ `"recommended"` ไม่ใช่ `"rejected"` อีกต่อไป
เหลือแค่ `decision: "reject"` ที่ให้ `"rejected"`

**ยกเลิกการตรวจไฟล์หลักฐานตอน save ทั้งขาขึ้นและขาลง** — ผู้ประเมินปรับคะแนนขึ้นได้แม้ไฟล์ไม่ครบ
ฝั่ง UI ไม่ต้อง disable ปุ่มตามจำนวนไฟล์แล้ว

### `POST /twhp/api/factories/assessments/answers/negotiate`

ถ้า log ล่าสุดมี `verdictChoice` ไม่ว่า action ใด จะได้ **400**
`"this score is final and needs no response"` — ครอบคลุมทั้ง `accept` และ `redo`
รวมถึง row เก่าที่เป็น `rejected` + มี choice ค้างใน production

เหลือหน้าที่เดียวคือ **ตอบกลับ hard reject** ซึ่งรับได้แค่ `redo` —
`action: "accept"` ยังอยู่ใน schema แต่กลายเป็น **dead value** ที่ spec ยังไม่ได้บอก
ปุ่ม "ยอมรับคะแนน" ควรถูกถอดออกทั้งหมด

### `GET /twhp/api/factories/assessments/answers`

สาม field เดิม ความหมายใหม่:

| status | verdictChoice | หมายถึง | โรงงานต้องทำอะไร |
|---|---|---|---|
| `rejected` | `null` | Hard reject — ไฟล์ถูกลบ | ทำใหม่ (`redo`) เท่านั้น |
| `recommended` | มีค่า | ปรับคะแนนแล้ว รอ finalize | ไม่ต้องทำอะไร — read-only |
| `finished` | มีค่า | ปรับคะแนนแล้ว ปิดจ็อบ | ไม่ต้องทำอะไร — read-only |
| `rejected` | มีค่า | row เก่าก่อน ADR-0012 | ไม่ต้องทำอะไร — backend กัน 400 ให้ |
| `in_review` | `null` | รอตรวจ หรือถูก reset (ดู § 3) | ตอบใหม่ได้ |

```ts
// เดิม — ตอนนี้จะเหมาเอา score change มาเป็น action item ผิด ๆ
const needsAction = a.status === "rejected";

// ใหม่
const needsAction  = a.status === "rejected" && a.verdictChoice === null;
const scoreChanged = a.verdictChoice !== null;   // read-only, แสดง description
```

`description` คือเหตุผลของผู้ประเมิน และตอนนี้ **ไม่ถูกล้างทิ้งตอน finalize แล้ว** (เดิม set เป็น null)
เป็นคำอธิบายเดียวที่โรงงานจะได้เห็น เพราะไม่มีการเจรจาอีกต่อไป — ต้องแสดงผลเสมอ

---

## § 3 — finalize ทำงานหนักขึ้นมาก 🟠 BEHAVIOR

response shape เดิม แต่ side effect เพิ่มหลายอย่างที่กระทบสิ่งที่ผู้ใช้เห็นหลังกดปุ่ม

### `POST /twhp/api/evaluators/covers/:coverId/finalize`

> alias เดียวกัน: `/twhp/api/admins/covers/:coverId/finalize`

- **finalize เป็นคนเขียนคะแนน** — `answers.selectedChoice` ถูกอัปเดตเป็น `verdictChoice` ที่นี่
  (งานที่เดิม `negotiate → accept` ทำ) เกรดที่คืนมาคำนวณจากคะแนนหลังปรับ
- **cover เด้งกลับเฉพาะเมื่อมี hard reject จริง** — `coverStatus` เป็น `in_progress`
  ก็ต่อเมื่อมีข้อที่ reject โดยไม่เสนอคะแนน ปรับคะแนนอย่างเดียวจะได้ `finished`
- **ข้อที่ `finished` แล้วถูกข้ามทั้งหมด** — finalize ซ้ำไม่สร้าง log ซ้ำ
- **promotion ครอบคลุมทุกข้อที่ไม่ใช่ hard reject** (เดิมเฉพาะ `recommended`)
  และยก `verdictChoice` + `description` ติดไปกับ row `finished`

#### Hard reject ลบใบรับรองมาตรฐานด้วยแล้ว

ปัญหาเดิม: ข้อที่ตอบจาก standard ไม่มีไฟล์ของตัวเอง hard reject จึงลบอะไรไม่ได้
พอทำใหม่ระบบ derive ได้ `"3"` เหมือนเดิม ตอนนี้ finalize จะ:

- ลบไฟล์ certificate ของทุก standard ที่ข้อถูก reject อ้างถึงและโรงงานเคลมไว้
- **un-claim** ใน `enrolls` — `standardXxx = false`, `fileStandardXxxUrl = null`
- **ผลกระทบข้างเคียง:** ข้ออื่นที่พึ่ง certificate ที่เพิ่งถูกลบ ถูกส่งกลับเป็น `in_review`
  แทนการ promote (ยกเว้นข้อที่ `finished` แล้ว ซึ่ง immutable)

**ผลต่อ UI:** หลัง finalize หน้าโรงงานอาจมีข้อกลับมาเป็น "รอตอบ" มากกว่าจำนวนข้อที่ถูก reject
และหน้าลงทะเบียน standard อาจมีช่องที่เคยติ๊กกลายเป็นว่าง — ทั้งสองเป็นพฤติกรรมที่ตั้งใจ
ควรมีข้อความอธิบาย ไม่ใช่ปล่อยให้ข้อมูลหายเฉย ๆ

ไฟล์ถูกลบจาก MinIO **ก่อน** transaction แบบ strict — ลบไม่สำเร็จได้ **500**
และไม่มีอะไรเขียนลง DB ปลอดภัยที่จะให้ผู้ใช้ retry

---

## § 4 — ของแถมที่ได้มาฟรี 🟢 ADDITIVE

ไม่ต้องแก้อะไรก็ไม่พัง แต่รู้ไว้จะได้ลบ workaround เก่าออก

### `GET /twhp/api/admins/factories` — `+email`

แต่ละ item เพิ่ม `email: string` — อีเมล login ของบัญชีโรงงาน (`accounts.email`, notNull + unique)

**มีเฉพาะ route ของ Admin** — Evaluator กับ Provincial Officer ใช้ schema คนละตัวที่ไม่ join `accounts`
อย่าเขียน component รายการโรงงานตัวเดียวแล้วสมมติว่า `email` มีเสมอ

### รายการโรงงานไม่มีแถวซ้ำอีกแล้ว

เดิมโรงงานที่เคยลงทะเบียนหลายปีงบประมาณจะโผล่ซ้ำเท่าจำนวนปีที่ลง (บน Admin เป็นแบบไม่มีเงื่อนไข)
ตอนนี้ filter `enrolled` ถูกเขียนใหม่เป็น `EXISTS` subquery แถวจึงไม่ถูกคูณอีก (ADR-0008)
— **ถ้าฝั่ง frontend เคยมีโค้ด dedupe รายการโรงงาน ลบออกได้**

ข้อควรระวังที่ *ไม่* ได้แก้: `enrolled=false` ยังแปลว่า "ไม่ต้องกรองตามปีงบประมาณ"
ไม่ใช่ "เอาเฉพาะโรงงานที่ยังไม่ลงทะเบียน" — ตั้งใจคงไว้เหมือนเดิม

### อีเมลแจ้งผลส่งถึงมือแน่นอนขึ้น

เดิมส่งไปที่ `safety_officer_email` ซึ่ง nullable — โรงงานไม่กรอกก็เงียบหายไปเฉย ๆ ไม่มี error ไม่มี log
ตอนนี้ส่งไปที่อีเมลบัญชีโรงงานเป็นหลัก และ cc เจ้าหน้าที่ความปลอดภัยเมื่อมีอีเมลของตัวเอง
ใช้ทั้งกรณี finished และกรณีตีกลับ ไม่กระทบ API ที่เรียก
แต่ถ้าเคยมี note ใน UI ว่า "ต้องกรอกอีเมล จป. ไม่งั้นไม่ได้รับแจ้ง" ควรแก้ข้อความ

---

## § 5 — สิ่งที่ต้องแก้ฝั่ง Frontend

เรียงตามความเสี่ยง — ข้อ 1 พังทันที ข้อ 2–3 พังเงียบ ๆ

1. **อ่าน list response ผ่าน `.items` และต่อ pager กับ `meta`**
   ครอบคลุม 9 endpoint ใน § 1 ถ้ายังไม่แก้ หน้ารายการทั้งหมดของ staff พังทันที
2. **แก้เงื่อนไข "ต้องดำเนินการ" ของหน้าโรงงาน**
   จาก `status === "rejected"` เป็น `status === "rejected" && verdictChoice === null`
   มิฉะนั้นโรงงานเห็นการ์ดให้กดตอบในข้อที่จบไปแล้ว แล้วยิงไปโดน 400
3. **ถอดปุ่ม "ยอมรับคะแนน" (accept) ออก**
   `negotiate` เหลือแค่ `redo` สำหรับ hard reject
4. **เพิ่ม UI แสดงคะแนนที่ถูกปรับแบบ read-only**
   โชว์ `verdictChoice` คู่กับ `description` พร้อมสื่อว่าเป็นคำตัดสินสุดท้าย ไม่ใช่คำขอ
5. **ปรับหน้าผู้ประเมิน: ปลด validation ไฟล์ตอนปรับคะแนน**
   backend ไม่เช็คแล้ว และควรเตือนให้ชัดว่าการปรับคะแนน*ย้อนกลับไม่ได้*ก่อนกดยืนยัน
6. **รองรับผลข้างเคียงหลัง finalize**
   refetch ทั้งรายการคำตอบและข้อมูล enroll — ข้ออาจกลับมาเป็น `in_review`
   และ standard ที่เคยเคลมอาจหายไป
7. **ใส่คอลัมน์ email ในตารางโรงงานของ Admin** เฉพาะหน้า Admin
8. **ลบโค้ด dedupe รายการโรงงาน ถ้ามี** backend ไม่คืนแถวซ้ำแล้ว

### ยังไม่ได้ทำ / นอกขอบเขต

- ข้อที่ `finished` แล้วจะไม่ถูกเปิดใหม่ แม้ certificate ที่ใช้เป็นฐานจะถูกลบ — กันไว้เป็น intent แยก
- ไม่มีการ backfill row เก่าที่เป็น `rejected` + มี `verdictChoice` —
  backend จำแนกด้วย `verdictChoice` แทน `status` จึงรองรับได้ทั้งสองแบบ
- `enrolled=false` ยังมีความหมายที่ชวนสับสนเหมือนเดิม (ดู § 4)

---

*สแกน 51 operations เทียบ `docs/api/openapi.json` กับ `dev` ที่รันจริง · เปลี่ยน 9 · 0 path เพิ่ม/ลด · 0 body เปลี่ยน*
