import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import { clientCache } from "@middlewares/cache";
import { otakudesuInfo, otakudesuRoute } from "@otakudesu/index";
import { samehadakuInfo, samehadakuRoute } from "@samehadaku/index";
import mainRoute from "@routes/mainRoute";
import errorHandler from "@middlewares/errorHandler";
import mainController from "@controllers/mainController";
import animeConfig from "@configs/animeConfig";
import { existsSync } from "fs";

const app = new Hono();

const staticRoot = existsSync("./dist/public") ? "./dist/public" : "./src/public";

app.use("*", cors());
app.use("*", clientCache(1));
app.use("/css/*", serveStatic({ root: staticRoot }));
app.use("/js/*", serveStatic({ root: staticRoot }));
app.use("/views/*", serveStatic({ root: staticRoot }));

app.route(otakudesuInfo.baseUrlPath, otakudesuRoute);
app.route(samehadakuInfo.baseUrlPath, samehadakuRoute);
app.route("/", mainRoute);

app.notFound(() => mainController._404());
app.onError(errorHandler);

const { PORT } = animeConfig;

serve({
  fetch: app.fetch,
  port: PORT,
}, (info) => {
  console.log(`SERVER BERJALAN DI http://localhost:${info.port}`);
});
