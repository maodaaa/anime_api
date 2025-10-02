import { Hono } from "hono";
import { serverCache } from "@middlewares/cache";
import controller from "@otakudesu/controllers/otakudesuController";

const otakudesuRoute = new Hono();

otakudesuRoute
  .get("/", (c) => controller.getMainView(c))
  .get("/view-data", serverCache(), (c) => controller.getMainViewData(c))
  .get("/home", serverCache(10), (c) => controller.getHome(c))
  .get("/schedule", serverCache(10), (c) => controller.getSchedule(c))
  .get("/anime", serverCache(10), (c) => controller.getAllAnimes(c))
  .get("/genres", serverCache(), (c) => controller.getAllGenres(c))
  .get("/ongoing", serverCache(10), (c) => controller.getOngoingAnimes(c))
  .get("/completed", serverCache(10), (c) => controller.getCompletedAnimes(c))
  .get("/search", serverCache(10), (c) => controller.getSearch(c))
  .get("/genres/:genreId", serverCache(10), (c) => controller.getGenreAnimes(c))
  .get("/anime/:animeId", serverCache(30), (c) => controller.getAnimeDetails(c))
  .get("/episode/:episodeId", serverCache(30), (c) => controller.getAnimeEpisode(c))
  .get("/server/:serverId", serverCache(3), (c) => controller.getServerUrl(c))
  .post("/server/:serverId", serverCache(3), (c) => controller.getServerUrl(c))
  .get("/batch/:batchId", serverCache(30), (c) => controller.getAnimeBatch(c));

export default otakudesuRoute;
