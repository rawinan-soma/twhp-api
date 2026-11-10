import { ParseError, t } from "elysia";
import type { App } from "../../..";
import { adminGuard } from "../../../middleware/guards";
import { AdminFactoryListItemSchema, ApproveFactoryBodySchema } from "../../../schema/factory";
import { FactoryNameSearchQuery } from "../../../schema/factory-name-search";
import { FiscalYearQuery } from "../../../schema/fiscal-year";
import { Paginated, PaginationQuery } from "../../../schema/pagination";
import { adminService } from "../../../service/admin";
import { factoryService } from "../../../service/factory";

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
          // Elysia swallows a JSON parse error on an optional body and does not validate a JSON value
          // that is not an object. Either would approve the Factory and silently drop its Prior
          // Awards. The named parser never runs; it is what makes the OpenAPI document list the JSON
          // body.
          parse: [
            async ({ request, contentType }) => {
              if (contentType === "multipart/form-data") {
                return Object.fromEntries(await request.formData());
              }
              const raw = await request.text();
              if (raw.trim() === "") return {};
              let parsed: unknown;
              try {
                parsed = JSON.parse(raw);
              } catch {
                throw new ParseError();
              }
              if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
                throw new ParseError();
              }
              return parsed;
            },
            "application/json",
          ],
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
