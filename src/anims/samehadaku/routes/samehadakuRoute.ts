import { Hono } from "hono";
import { serverCache } from "@middlewares/cache";
import controller from "@samehadaku/controllers/samehadakuController";

const samehadakuRoute = new Hono();

samehadakuRoute
  .get("/", (c) => controller.getMainView(c))
  .get("/view-data", serverCache(), (c) => controller.getMainViewData(c))
  .get("/home", serverCache(10), (c) => controller.getHome(c))
  .get("/genres", serverCache(), (c) => controller.getAllGenres(c))
  .get("/anime", serverCache(10), (c) => controller.getAllAnimes(c))
  .get("/schedule", serverCache(10), (c) => controller.getSchedule(c))
  .get("/recent", serverCache(10), (c) => controller.getRecentEpisodes(c))
  .get("/ongoing", serverCache(10), (c) => controller.getOngoingAnimes(c))
  .get("/completed", serverCache(10), (c) => controller.getCompletedAnimes(c))
  .get("/popular", serverCache(10), (c) => controller.getPopularAnimes(c))
  .get("/movies", serverCache(10), (c) => controller.getMovies(c))
  .get("/batch", serverCache(10), (c) => controller.getBatches(c))
  .get("/search", serverCache(10), (c) => controller.getSearch(c))
  .get("/genres/:genreId", serverCache(10), (c) => controller.getGenreAnimes(c))
  .get("/anime/:animeId", serverCache(30), (c) => controller.getAnimeDetails(c))
  .get("/episode/:episodeId", serverCache(30), (c) => controller.getAnimeEpisode(c))
  .get("/server/:serverId", serverCache(3), (c) => controller.getServerUrl(c))
  .post("/server/:serverId", serverCache(3), (c) => controller.getServerUrl(c))
  .get("/batch/:batchId", serverCache(30), (c) => controller.getAnimeBatch(c))
  .get("/wibu-file", serverCache(3, "text"), (c) => controller.getWibuFile(c));

export default samehadakuRoute;
