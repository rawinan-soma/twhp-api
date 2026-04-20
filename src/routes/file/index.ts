import { t } from "elysia";
import { App } from "../..";
import { jwtPlugin } from "../../middleware/jwt";
import { fileService } from "../../service/file";

export default (app: App) =>
  app.group("", { detail: { tags: ["file"] } }, (group) =>
    group.use(jwtPlugin).get(
      "/presigned-url",
      async ({ query: { fileName } }) => {
        return await fileService.getPresignedUrl(fileName);
      },
      {
        detail: { description: "Get a 5-minute presigned URL for a stored file" },
        query: t.Object({ fileName: t.String() }),
        response: {
          200: t.Object({ url: t.String() }),
          400: t.Object({ message: t.String({ default: "invalid file url" }) }),
        },
      },
    ),
  );
