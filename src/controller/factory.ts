import Elysia, { t } from "elysia";
import { CreateFactorySchema, UpdateFactorySchema } from "../schema/factory";
import { factoryService } from "../service/factory";
import { jwtPlugin } from "../middleware/jwt";
import { requireRoles } from "../middleware/rbac";
import { Role } from "../service/authentication";
import {
  CreateEnrollWithFilesSchema,
  UpdateEnrollWithFilesSchema,
} from "../schema/enroll";
import { BaseEnrollSelect } from "../schema";
import { sharedService } from "../service/shared";

const registerFactoryController = new Elysia().post(
  "/register",
  async ({ body }) => {
    return await factoryService.register(body);
  },
  {
    body: CreateFactorySchema,
    response: t.Object({
      message: t.String({ default: "factory created successfully" }),
    }),
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
          return await sharedService.factory.update(id, body);
        },
        {
          body: UpdateFactorySchema,
          response: t.Object({
            message: t.String({ default: "factory updated successfully" }),
          }),
        },
      ),
  )
  .group("/enrolls", (fc) =>
    fc
      .use(jwtPlugin)
      .use(requireRoles(Role.Factory))
      .post(
        "",
        async ({ body, jwtPayload }) => {
          const id = Number(jwtPayload.sub);
          return await sharedService.enroll.create(body, id);
        },
        {
          body: CreateEnrollWithFilesSchema,
          response: t.Object({
            message: t.String({ default: "create enrollment successfully" }),
          }),
        },
      )
      .get(
        "",
        async ({ jwtPayload }) => {
          const id = Number(jwtPayload.sub);
          return await sharedService.enroll.getEnrollByFactoryId(id);
        },
        {
          response: t.Optional(BaseEnrollSelect),
        },
      )
      .patch(
        "",
        async ({ jwtPayload, body }) => {
          const id = Number(jwtPayload.sub);
          return await sharedService.enroll.updateEnroll(id, body);
        },
        {
          body: UpdateEnrollWithFilesSchema,
          response: t.Object({
            message: t.String({ default: "enrollment updated successfully" }),
          }),
        },
      ),
  );
