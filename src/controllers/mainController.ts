import type { Context } from "hono";
import { setResponseError } from "@helpers/error";
import { otakudesuInfo } from "@otakudesu/index";
import { samehadakuInfo } from "@samehadaku/index";
import generatePayload from "@helpers/payload";
import { fileURLToPath } from "url";
import { readFile } from "fs/promises";
import { existsSync } from "fs";

const viewsBaseUrl = new URL("../public/views/", import.meta.url);
const animsBaseUrl = new URL("../anims/", import.meta.url);

async function renderHtml(c: Context, relativePath: string) {
  const filePath = fileURLToPath(new URL(relativePath, viewsBaseUrl));
  const html = await readFile(filePath, "utf-8");

  return c.html(html);
}

function animSourceExists(routePath: string): boolean {
  const sanitizedRoute = routePath.replace(/^\//, "");
  const absolutePath = fileURLToPath(new URL(sanitizedRoute, animsBaseUrl));

  return existsSync(absolutePath);
}

const mainController = {
  async getMainView(c: Context) {
    return renderHtml(c, "home.html");
  },

  async getMainViewData(c: Context) {
    const animeSources = {
      otakudesu: otakudesuInfo,
      samehadaku: samehadakuInfo,
    };

    const data = {
      message: "WAJIK ANIME API IS READY 🔥🔥🔥",
      sources: Object.values(animeSources).reduce<
        { title: string; route: string }[]
      >((acc, source) => {
        if (animSourceExists(source.baseUrlPath)) {
          acc.push({
            title: source.title,
            route: source.baseUrlPath,
          });
        }

        return acc;
      }, []),
    };

    return c.json(generatePayload(200, { data }));
  },

  _404(): never {
    setResponseError(404, "halaman tidak ditemukan");
  },
};

export default mainController;
