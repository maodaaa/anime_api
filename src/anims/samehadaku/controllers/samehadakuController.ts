import type { Context } from "hono";
import { getOrderParam, getPageParam, getQParam, getUrlParam } from "@helpers/queryParams";
import SamehadakuParser from "@samehadaku/parsers/SamehadakuParser";
import samehadakuInfo from "@samehadaku/info/samehadakuInfo";
import generatePayload from "@helpers/payload";
import { fileURLToPath } from "url";
import { readFile } from "fs/promises";

const { baseUrl, baseUrlPath } = samehadakuInfo;
const parser = new SamehadakuParser(baseUrl, baseUrlPath);
const viewsBaseUrl = new URL("../../../../public/views/", import.meta.url);

async function renderView(c: Context, fileName: string) {
  const filePath = fileURLToPath(new URL(fileName, viewsBaseUrl));
  const html = await readFile(filePath, "utf-8");

  return c.html(html);
}

function resolveOrigin(c: Context): string {
  const forwardedProto = c.req.header("x-forwarded-proto");
  const forwardedHost = c.req.header("x-forwarded-host");
  const host = c.req.header("host");

  try {
    const requestUrl = new URL(c.req.url);
    const protocol = forwardedProto || requestUrl.protocol.replace(/:\s*$/, "");
    const finalHost = forwardedHost || host || requestUrl.host;

    return `${protocol}://${finalHost}`;
  } catch (error) {
    const protocol = forwardedProto || "http";
    const finalHost = forwardedHost || host || "localhost";

    return `${protocol}://${finalHost}`;
  }
}

const samehadakuController = {
  getMainView(c: Context) {
    return renderView(c, "anime-source.html");
  },

  getMainViewData(c: Context) {
    const data = samehadakuInfo;

    return c.json(generatePayload(200, { data }));
  },

  async getHome(c: Context) {
    const data = await parser.parseHome();

    return c.json(generatePayload(200, { data }));
  },

  async getAllGenres(c: Context) {
    const data = await parser.parseAllGenres();

    return c.json(generatePayload(200, { data }));
  },

  async getAllAnimes(c: Context) {
    const data = await parser.parseAllAnimes();

    return c.json(generatePayload(200, { data }));
  },

  async getSchedule(c: Context) {
    const data = await parser.parseSchedule();

    return c.json(generatePayload(200, { data }));
  },

  async getRecentEpisodes(c: Context) {
    const page = getPageParam(c);
    const { data, pagination } = await parser.parseRecentAnime(page);

    return c.json(generatePayload(200, { data, pagination }));
  },

  async getOngoingAnimes(c: Context) {
    const page = getPageParam(c);
    const order = getOrderParam(c);
    const { data, pagination } = await parser.parseOngoingAnimes(page, order);

    return c.json(generatePayload(200, { data, pagination }));
  },

  async getCompletedAnimes(c: Context) {
    const page = getPageParam(c);
    const order = getOrderParam(c);
    const { data, pagination } = await parser.parseCompletedAnimes(page, order);

    return c.json(generatePayload(200, { data, pagination }));
  },

  async getPopularAnimes(c: Context) {
    const page = getPageParam(c);
    const { data, pagination } = await parser.parsePopularAnimes(page);

    return c.json(generatePayload(200, { data, pagination }));
  },

  async getMovies(c: Context) {
    const page = getPageParam(c);
    const { data, pagination } = await parser.parseMovies(page);

    return c.json(generatePayload(200, { data, pagination }));
  },

  async getBatches(c: Context) {
    const page = getPageParam(c);
    const { data, pagination } = await parser.parseBatches(page);

    return c.json(generatePayload(200, { data, pagination }));
  },

  async getSearch(c: Context) {
    const q = getQParam(c);
    const page = getPageParam(c);
    const { data, pagination } = await parser.parseSearch(q, page);

    return c.json(generatePayload(200, { data, pagination }));
  },

  async getGenreAnimes(c: Context) {
    const genreId = c.req.param("genreId");
    const page = getPageParam(c);
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
    const originUrl = resolveOrigin(c);
    const data = await parser.parseAnimeEpisode(episodeId, originUrl);

    return c.json(generatePayload(200, { data }));
  },

  async getServerUrl(c: Context) {
    const serverId = c.req.param("serverId");
    const originUrl = resolveOrigin(c);
    const data = await parser.parseServerUrl(serverId, originUrl);

    return c.json(generatePayload(200, { data }));
  },

  async getAnimeBatch(c: Context) {
    const batchId = c.req.param("batchId");
    const data = await parser.parseAnimeBatch(batchId);

    return c.json(generatePayload(200, { data }));
  },

  async getWibuFile(c: Context) {
    const url = getUrlParam(c);
    const wibuFile = await parser.parseWibuFile(url);

    return c.text(wibuFile);
  },
};

export default samehadakuController;
