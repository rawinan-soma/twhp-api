import { status } from "elysia";
import { utilities } from "../utils";

export const createFileService = () => ({
  getPresignedUrl: async (fileName: string) => {
    if (!fileName) return status(400, { message: "invalid file name" });

    return { url: await utilities().getPresignedUrl(fileName) };
  },
});

export const fileService = createFileService();
