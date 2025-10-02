import type { Context } from "hono";
import { setResponseError } from "@helpers/error";
import { otakudesuInfo } from "@otakudesu/index";
import { samehadakuInfo } from "@samehadaku/index";
import generatePayload from "@helpers/payload";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

const projectRoot = process.cwd();
const viewDirectories = [
  join(projectRoot, "dist/public/views"),
  join(projectRoot, "src/public/views"),
];
const animDirectories = [
  join(projectRoot, "dist/anims"),
  join(projectRoot, "src/anims"),
];

async function renderHtml(c: Context, relativePath: string) {
  for (const basePath of viewDirectories) {
    const filePath = join(basePath, relativePath);

    if (existsSync(filePath)) {
      const html = await readFile(filePath, "utf-8");

      return c.html(html);
    }
  }

  setResponseError(500, "gagal memuat halaman");
}

function animSourceExists(routePath: string): boolean {
  const sanitizedRoute = routePath.replace(/^\//, "");

  return animDirectories.some((basePath) =>
    existsSync(join(basePath, sanitizedRoute)),
  );
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
