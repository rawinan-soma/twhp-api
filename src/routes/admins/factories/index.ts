import { getSchemaValidator, ParseError, t } from "elysia";
import type { App } from "../../..";
import { adminGuard } from "../../../middleware/guards";
import { AdminFactoryListItemSchema, ApproveFactoryBodySchema } from "../../../schema/factory";
import { FactoryNameSearchQuery } from "../../../schema/factory-name-search";
import { FiscalYearQuery } from "../../../schema/fiscal-year";
import { Paginated, PaginationQuery } from "../../../schema/pagination";
import { adminService } from "../../../service/admin";
import { factoryService } from "../../../service/factory";

const approveBodyValidator = getSchemaValidator(ApproveFactoryBodySchema, {
  additionalProperties: true,
});

export default (app: App) =>
  app.group("", { detail: { tags: ["admins"] } }, (group) =>
    group
      .use(adminGuard)
      .get(
        "",
        async ({ query }) => {
          return await factoryService.getAllFactories(query);
        },
        {
          detail: {
            description: "ดึงข้อมูล สปก. ทั้งหมด (แบ่งหน้าด้วย ?page= และ ?limit=)",
          },
          query: t.Composite([
            t.Object({
              validated: t.Boolean(),
              enrolled: t.Optional(t.Boolean()),
              region: t.Optional(t.Number()),
              provinceId: t.Optional(t.Number()),
            }),
            PaginationQuery,
            FactoryNameSearchQuery,
            FiscalYearQuery,
          ]),
          response: Paginated(AdminFactoryListItemSchema),
        },
      )
      .patch(
        "/validate/:id",
        async ({ params, body }) => {
          return await adminService.approveFactoryRegister(params.id, body?.awards);
        },
        {
          detail: {
            description:
              "อนุมัติการลงทะเบียน และบันทึกรางวัลในอดีต (Prior Award) ของโรงงานในคำขอเดียวกันได้ ไม่ส่ง body ก็ได้",
          },
          params: t.Object({ id: t.Number() }),
          // On an optional body Elysia swallows a JSON parse error, does not validate a value that is
          // not an object, and copies anything with a length into an array before validating it.
          // Each would approve the Factory and drop or hide Prior Awards, so this route reads only
          // JSON and checks the body as sent. The check is in `transform` because `parse` runs before
          // adminGuard and `transform` after it, so a caller the guard refuses never learns the body
          // rules. The named parser never runs; it is what makes the OpenAPI document list the JSON
          // body.
          parse: [({ request }) => request.text(), "application/json"],
          transform: (context) => {
            const raw = context.body as unknown as string;
            if (raw.trim() === "") {
              context.body = {};
              return;
            }
            let parsed: unknown;
            try {
              parsed = JSON.parse(raw);
            } catch {
              throw new ParseError();
            }
            if (!approveBodyValidator.Check(parsed)) {
              throw new ParseError();
            }
            context.body = parsed as typeof context.body;
          },
          body: ApproveFactoryBodySchema,
          response: {
            200: t.Object({
              message: t.String({ default: "factory validated!" }),
            }),
            404: t.Object({
              message: t.String({ default: "factory not found" }),
            }),
            400: t.Object(
              { message: t.String({ default: "factory already validated" }) },
              {
                description:
                  "โรงงานได้รับอนุมัติแล้ว, body ไม่ถูกต้อง, fiscalYear ซ้ำใน awards หรือมีแถว Awards ของปีนั้นอยู่แล้ว (ข้อความระบุปี)",
              },
            ),
          },
        },
      ),
  );
