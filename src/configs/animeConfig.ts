const boolFromEnv = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};

const numFromEnv = (value: string | undefined, defaultValue: number): number => {
  if (value === undefined) return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

const animeConfig = {
  PORT: 3001,

  baseUrl: {
    otakudesu: "https://otakudesu.best",
    samehadaku: "https://v1.samehadaku.how",
  },

  scraper: {
    respectRobotsTxt: boolFromEnv(process.env.SCRAPER_RESPECT_ROBOTS, true),
    defaultRateLimit: {
      jitterMs: numFromEnv(process.env.SCRAPER_RATE_LIMIT_JITTER_MS, 350),
    },
    browserFallback: {
      enabled: boolFromEnv(process.env.SCRAPER_BROWSER_FALLBACK, true),
      provider: (process.env.SCRAPER_BROWSER_PROVIDER as "chromium" | "firefox" | "webkit" | undefined) ?? "chromium",
      waitUntil: (process.env.SCRAPER_BROWSER_WAIT_UNTIL as
        | "load"
        | "domcontentloaded"
        | "networkidle"
        | undefined) ?? "domcontentloaded",
      navigationTimeoutMs: numFromEnv(process.env.SCRAPER_BROWSER_TIMEOUT_MS, 25000),
      headless: boolFromEnv(process.env.SCRAPER_BROWSER_HEADLESS, true),
      userAgent:
        process.env.SCRAPER_BROWSER_UA ??
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
  },

  response: {
    /* ngebalikin respon href biar gampang nyari ref idnya contoh {"href": "/otakudesu/anime/animeId"} value = false akan mengurangi ukuran response <> up to 30% */
    href: true,

    /* ngebalikin respon url sumber contoh {"otakudesuUrl": "https://otakudesu.cloud/anime/animeId"}                          ""                              40% */
    sourceUrl: true,
  },
};

export default animeConfig;
