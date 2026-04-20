import { t } from "elysia";
import { App } from "../..";
import { factoryGuard } from "../../middleware/guards";
import { CreateFactorySchema, UpdateFactorySchema } from "../../schema/factory";
import { factoryService } from "../../service/factory";

export default (app: App) =>
  app
    .group("", { detail: { tags: ["factories"] } }, (group) =>
      group.post(
        "/register",
        async ({ body }) => {
          return await factoryService.register(body);
        },
        {
          detail: { description: "ลงทะเบียนสปก." },
          body: CreateFactorySchema,
          response: {
            201: t.Object({
              message: t.String({ default: "factory created successfully" }),
            }),
            400: t.Object({
              message: t.String({ default: "factory already registered" }),
            }),
            404: t.Object({ message: t.String({ default: "location not found" }) }),
          },
        },
      ),
    )
    .group("", { detail: { tags: ["factories"] } }, (group) =>
      group.use(factoryGuard).patch(
        "",
        async ({ jwtPayload, body }) => {
          const id = Number(jwtPayload.sub);
          return await factoryService.update(id, body);
        },
        {
          detail: { description: "อัปเดตข้อมูลสปก." },
          body: UpdateFactorySchema,
          response: {
            200: t.Object({
              message: t.String({ default: "factory updated successfully" }),
            }),
            400: t.Object({
              message: t.String({ default: "invalid subdistrict id" }),
            }),
            404: t.Object({
              message: t.String({ default: "factory not found" }),
            }),
          },
        },
      ),
    );
