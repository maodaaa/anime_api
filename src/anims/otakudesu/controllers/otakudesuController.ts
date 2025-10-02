import type { Context } from "hono";
import { getPageParam, getQParam } from "@helpers/queryParams";
import OtakudesuParser from "@otakudesu/parsers/OtakudesuParser";
import otakudesuInfo from "@otakudesu/info/otakudesuInfo";
import generatePayload from "@helpers/payload";
import { fileURLToPath } from "url";
import { readFile } from "fs/promises";

const { baseUrl, baseUrlPath } = otakudesuInfo;
const parser = new OtakudesuParser(baseUrl, baseUrlPath);
const viewsBaseUrl = new URL("../../../../public/views/", import.meta.url);

async function renderView(c: Context, fileName: string) {
  const filePath = fileURLToPath(new URL(fileName, viewsBaseUrl));
  const html = await readFile(filePath, "utf-8");

  return c.html(html);
}

const otakudesuController = {
  getMainView(c: Context) {
    return renderView(c, "anime-source.html");
  },

  getMainViewData(c: Context) {
    const data = otakudesuInfo;

    return c.json(generatePayload(200, { data }));
  },

  async getHome(c: Context) {
    const data = await parser.parseHome();

    return c.json(generatePayload(200, { data }));
  },

  async getSchedule(c: Context) {
    const data = await parser.parseSchedule();

    return c.json(generatePayload(200, { data }));
  },

  async getAllAnimes(c: Context) {
    const data = await parser.parseAllAnimes();

    return c.json(generatePayload(200, { data }));
  },

  async getAllGenres(c: Context) {
    const data = await parser.parseAllGenres();

    return c.json(generatePayload(200, { data }));
  },

  async getOngoingAnimes(c: Context) {
    const page = getPageParam(c);
    const { data, pagination } = await parser.parseOngoingAnimes(page);

    return c.json(generatePayload(200, { data, pagination }));
  },

  async getCompletedAnimes(c: Context) {
    const page = getPageParam(c);
    const { data, pagination } = await parser.parseCompletedAnimes(page);

    return c.json(generatePayload(200, { data, pagination }));
  },

  async getSearch(c: Context) {
    const q = getQParam(c);
    const data = await parser.parseSearch(q);

    return c.json(generatePayload(200, { data }));
  },

  async getGenreAnimes(c: Context) {
    const page = getPageParam(c);
    const genreId = c.req.param("genreId");
    const { data, pagination } = await parser.parseGenreAnimes(genreId, page);

    return c.json(generatePayload(200, { data, pagination }));
  },

  async getAnimeDetails(c: Context) {
    const animeId = c.req.param("animeId");
    const data = await parser.parseAnimeDetails(animeId);

    return c.json(generatePayload(200, { data }));
  },

  async getAnimeEpisode(c: Context) {
    const episodeId = c.req.param("episodeId");
    const data = await parser.parseAnimeEpisode(episodeId);

    return c.json(generatePayload(200, { data }));
  },

  async getServerUrl(c: Context) {
    const serverId = c.req.param("serverId");
    const data = await parser.parseServerUrl(serverId);

    return c.json(generatePayload(200, { data }));
  },

  async getAnimeBatch(c: Context) {
    const batchId = c.req.param("batchId");
    const data = await parser.parseAnimeBatch(batchId);

    return c.json(generatePayload(200, { data }));
  },
};

export default otakudesuController;
