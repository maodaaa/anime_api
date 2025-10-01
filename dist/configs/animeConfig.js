"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const boolFromEnv = (value, defaultValue) => {
    if (value === undefined)
        return defaultValue;
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};
const numFromEnv = (value, defaultValue) => {
    if (value === undefined)
        return defaultValue;
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
            provider: process.env.SCRAPER_BROWSER_PROVIDER ?? "chromium",
            waitUntil: process.env.SCRAPER_BROWSER_WAIT_UNTIL ?? "domcontentloaded",
            navigationTimeoutMs: numFromEnv(process.env.SCRAPER_BROWSER_TIMEOUT_MS, 25000),
            headless: boolFromEnv(process.env.SCRAPER_BROWSER_HEADLESS, true),
            userAgent: process.env.SCRAPER_BROWSER_UA ??
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
    },
    response: {
        href: true,
        sourceUrl: true,
    },
};
exports.default = animeConfig;
