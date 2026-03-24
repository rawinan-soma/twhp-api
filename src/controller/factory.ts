import Elysia, { t } from "elysia";
import { CreateFactorySchema, UpdateFactorySchema } from "../schema/factory";
import { factoryService } from "../service/factory";
import { jwtPlugin } from "../middleware/jwt";
import { requireRoles } from "../middleware/rbac";
import { Role } from "../service/authentication";
import { CreateEnrollWithFilesSchema, UpdateEnrollWithFilesSchema } from "../schema/enroll";
import { BaseEnrollSelect } from "../schema";
import { enrollService } from "../service/enroll";
import { coverService } from "../service/cover";

const registerFactoryController = new Elysia().post(
  "/register",
  async ({ body }) => {
    return await factoryService.register(body);
  },
  {
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
);

export const factoryController = new Elysia({
  prefix: "/factories",
  tags: ["factory"],
})
  .group("", (fc) => fc.use(registerFactoryController))
  .group("", (fc) =>
    fc
      .use(jwtPlugin)
      .use(requireRoles(Role.Factory))
      .patch(
        "",
        async ({ jwtPayload, body }) => {
          const id = Number(jwtPayload.sub);
          return await factoryService.update(id, body);
        },
        {
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
  )
  .group("/enrolls", (fc) =>
    fc
      .use(jwtPlugin)
      .use(requireRoles(Role.Factory))
      .post(
        "",
        async ({ body, jwtPayload, set }) => {
          const id = Number(jwtPayload.sub);
          return await enrollService.create(body, id);
        },
        {
          body: CreateEnrollWithFilesSchema,
          parse: "multipart/form-data",
          response: {
            201: t.Object({
              message: t.String({ default: "create enrollment successfully" }),
            }),
            400: t.Union([
              t.Object({
                message: t.String({
                  default: "standard ... is issue but file is missing",
                  description: "Standard = true but no file",
                }),
              }),
              t.Object({
                message: t.String({
                  default: "already make an enroll in fiscal year",
                  description: "existing enroll",
                }),
              }),
            ]),
          },
        },
      )
      .get(
        "",
        async ({ jwtPayload }) => {
          const id = Number(jwtPayload.sub);
          return await enrollService.getEnrollByFactoryId(id);
        },
        {
          response: t.Union([
            t.Partial(BaseEnrollSelect),
            t.Object({ message: t.String({ default: "no enrollment found" }) }),
          ]),
        },
      )
      .patch(
        "",
        async ({ jwtPayload, body }) => {
          const id = Number(jwtPayload.sub);
          return await enrollService.updateEnroll(id, body);
        },
        {
          body: UpdateEnrollWithFilesSchema,
          response: {
            200: t.Object({
              message: t.String({ default: "enrollment updated successfully" }),
            }),
            404: t.Object({
              message: t.String({
                default: "Enroll not found for this fiscal year",
              }),
            }),
            400: t.Object({
              message: t.String({
                default: "standard ... is issue but file is missing",
                description: "Standard = true but no file",
              }),
            }),
          },
          parse: "multipart/form-data",
        },
      ),
  )
  .group("/assessments", (fc) =>
    fc
      .use(jwtPlugin)
      .use(requireRoles(Role.Factory))
      .post(
        "covers",
        async ({ jwtPayload, status }) => {
          const factoryId = Number(jwtPayload.sub);
          const enroll = await enrollService.getEnrollByFactoryId(factoryId);
          if ("message" in enroll) {
            return status(404, { message: "enroll not found" });
          }
          return await coverService.create(enroll.id);
        },
        {
          response: {
            201: t.Object({
              message: t.String({ default: "assessment cover created!" }),
            }),
            400: t.Object({
              message: t.String({ default: "cover already exists for this enroll" }),
            }),
            404: t.Object({
              message: t.String({
                default: "enroll not found",
                description: "if factory do not enroll yet",
              }),
            }),
          },
        },
      ),
  );
