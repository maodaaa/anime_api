"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchPageWithBrowser = fetchPageWithBrowser;
exports.shutdownBrowser = shutdownBrowser;
const animeConfig_1 = __importDefault(require("../configs/animeConfig"));
let cachedBrowser = null;
let browserQueue;
async function loadPlaywright() {
    try {
        return await Promise.resolve().then(() => __importStar(require("playwright-core")));
    }
    catch (error) {
        throw new Error("playwright-core tidak ditemukan. Instal dependency ini untuk mengaktifkan browser fallback.");
    }
}
async function ensureBrowser(playwright, provider, headless) {
    if (cachedBrowser && cachedBrowser.provider === provider && cachedBrowser.headless === headless) {
        return cachedBrowser.promise;
    }
    const launchPromise = playwright[provider].launch({ headless });
    cachedBrowser = { provider, headless, promise: launchPromise };
    return launchPromise;
}
function buildExtraHeaders(options) {
    const headers = {};
    if (options.headers) {
        for (const [key, value] of Object.entries(options.headers)) {
            if (typeof value === "string" && value.trim()) {
                headers[key] = value;
            }
        }
    }
    if (options.referer) {
        headers["Referer"] = options.referer;
    }
    return headers;
}
async function getBrowserQueue() {
    if (!browserQueue) {
        const PQueue = require("p-queue").default;
        browserQueue = new PQueue({ concurrency: 1 });
    }
    return browserQueue;
}
async function fetchPageWithBrowser(options) {
    const globalConfig = animeConfig_1.default.scraper?.browserFallback;
    if (!globalConfig?.enabled) {
        throw new Error("Browser fallback dimatikan melalui konfigurasi.");
    }
    const provider = (globalConfig.provider ?? "chromium");
    const headless = options.headless ?? globalConfig.headless ?? true;
    const waitUntil = options.waitUntil ?? globalConfig.waitUntil ?? "domcontentloaded";
    const timeout = options.timeoutMs ?? globalConfig.navigationTimeoutMs ?? 25_000;
    const userAgent = options.userAgent ?? globalConfig.userAgent;
    const queue = await getBrowserQueue();
    const result = (await queue.add(async () => {
        const playwright = await loadPlaywright();
        const browser = await ensureBrowser(playwright, provider, headless);
        const context = await browser.newContext({
            userAgent,
        });
        const extraHeaders = buildExtraHeaders(options);
        if (Object.keys(extraHeaders).length > 0) {
            await context.setExtraHTTPHeaders(extraHeaders);
        }
        const page = await context.newPage();
        let html;
        try {
            await page.goto(options.url, {
                waitUntil,
                timeout,
                referer: options.referer,
            });
            await page.waitForTimeout(250 + Math.random() * 400);
            html = await page.content();
        }
        finally {
            await context.close().catch(() => undefined);
        }
        return html;
    }));
    return result;
}
async function shutdownBrowser() {
    if (!cachedBrowser)
        return;
    try {
        const browser = await cachedBrowser.promise;
        await browser.close();
    }
    catch (error) {
    }
    finally {
        cachedBrowser = null;
    }
}
