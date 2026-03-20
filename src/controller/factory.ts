import Elysia, { t } from "elysia";
import { CreateFactorySchema, UpdateFactorySchema } from "../schema/factory";
import { factoryUsecase } from "../usecase/factory";
import { jwtPlugin } from "../middleware/jwt";
import { requireRoles } from "../middleware/rbac";
import { Role } from "../usecase/authentication";
import { enrollUsecase } from "../usecase/enroll";
import { CreateEnrollSchema } from "../schema/enroll";

const registerFactoryController = new Elysia().post(
  "/register",
  async ({ body }) => {
    return await factoryUsecase.register(body);
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
          return await factoryUsecase.update(id, body);
        },
        {
          body: UpdateFactorySchema,
          response: t.Object({
            message: t.String({ default: "factory updated successfully" }),
          }),
        },
      )
      .post(
        "/enrolls",
        async ({ body, jwtPayload }) => {
          const id = Number(jwtPayload.sub);
          return await enrollUsecase.create(body, id);
        },
        {
          body: CreateEnrollSchema,
          response: t.Object({
            message: t.String({ default: "create enrollment successfully" }),
          }),
        },
      )
      .post("enrolls/:id", async ({ jwtPayload }) => {
        const id = Number(jwtPayload.sub);
        return await enrollUsecase.getEnrollByFactoryId(id);
      }),
  );
