import { status } from "elysia";
import { utilities } from "../utils";

export const createFileService = () => ({
  getPresignedUrl: async (fileUrl: string) => {
    const url = new URL(fileUrl);
    const objectName = url.pathname.split("/").slice(2).join("/");

    if (!objectName) return status(400, { message: "invalid file url" });

    return { url: await utilities().getPresignedUrl(objectName) };
  },
});

export const fileService = createFileService();
