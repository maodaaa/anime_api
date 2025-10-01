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
exports.createFetcher = createFetcher;
exports.getOrCreateFetcher = getOrCreateFetcher;
exports.warmup = warmup;
exports.getFinalUrl = getFinalUrl;
exports.getFinalUrls = getFinalUrls;
const axios_1 = __importStar(require("axios"));
const axios_retry_1 = __importDefault(require("axios-retry"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const tough_cookie_1 = require("tough-cookie");
const http_1 = require("http-cookie-agent/http");
const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
];
const fetcherCache = new Map();
function createCookieJar(existing) {
    if (existing)
        return existing;
    return new tough_cookie_1.CookieJar();
}
function pickUserAgent(seed) {
    const hash = node_crypto_1.default
        .createHash("sha256")
        .update(seed ?? `${Date.now()}-${Math.random()}`)
        .digest();
    const index = hash[0] % USER_AGENTS.length;
    return USER_AGENTS[index];
}
function buildDefaultHeaders(options, ua) {
    const headers = {
        "User-Agent": ua,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        DNT: "1",
        "Upgrade-Insecure-Requests": "1",
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
    };
    if (options.origin) {
        headers["Origin"] = options.origin;
    }
    if (options.referer) {
        headers["Referer"] = options.referer;
    }
    if (options.headersExtra) {
        Object.assign(headers, options.headersExtra);
    }
    return headers;
}
function createFetcher(options = {}) {
    const jar = createCookieJar(options.jar);
    const httpAgent = new http_1.HttpCookieAgent({
        cookies: { jar },
        keepAlive: true,
    });
    const httpsAgent = new http_1.HttpsCookieAgent({
        cookies: { jar },
        keepAlive: true,
    });
    const client = axios_1.default.create({
        baseURL: options.baseURL,
        timeout: options.timeoutMs ?? 15_000,
        httpAgent,
        httpsAgent,
        withCredentials: true,
    });
    (0, axios_retry_1.default)(client, {
        retries: 3,
        retryDelay: (retryCount) => {
            const base = axios_retry_1.default.exponentialDelay(retryCount);
            const jitter = Math.floor(Math.random() * 400);
            return base + jitter;
        },
        shouldResetTimeout: true,
        retryCondition: (error) => {
            if (!axios_retry_1.default.isNetworkOrIdempotentRequestError(error)) {
                const status = error?.response?.status;
                if (!status)
                    return false;
                return [403, 408, 425, 429, 500, 502, 503, 504].includes(status);
            }
            return true;
        },
    });
    client.interceptors.request.use((config) => {
        const ua = pickUserAgent(options.baseURL ?? options.origin ?? options.referer);
        const existingHeaders = config.headers instanceof axios_1.AxiosHeaders
            ? config.headers.toJSON()
            : axios_1.AxiosHeaders.from(config.headers ?? {}).toJSON();
        const mergedHeaders = {
            ...buildDefaultHeaders(options, ua),
            ...existingHeaders,
        };
        config.headers = axios_1.AxiosHeaders.from(mergedHeaders);
        if (config.headers) {
            if (!("Accept-Encoding" in config.headers)) {
                config.headers["Accept-Encoding"] = "gzip, deflate, br";
            }
        }
        return config;
    });
    return { client, jar };
}
function resolveFetcherKey(options) {
    const base = options.baseURL ?? options.origin ?? options.referer ?? "default";
    return base;
}
function getOrCreateFetcher(options = {}) {
    const key = resolveFetcherKey(options);
    const existing = fetcherCache.get(key);
    if (existing)
        return existing;
    const context = createFetcher(options);
    fetcherCache.set(key, context);
    return context;
}
async function warmup(client, url) {
    try {
        await client.get(url, {
            responseType: "text",
            transformResponse: (data) => data,
        });
    }
    catch (error) {
    }
}
async function getFinalUrl(url, ref, axiosConfig) {
    const { client } = getOrCreateFetcher({
        baseURL: ref,
        origin: ref,
        referer: ref.endsWith("/") ? ref : `${ref}/`,
    });
    const response = await client.head(url, {
        ...axiosConfig,
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
    });
    const location = response.headers["location"];
    if (location) {
        try {
            const resolved = new URL(location, url);
            return resolved.toString();
        }
        catch (error) {
            return location;
        }
    }
    return url;
}
async function getFinalUrls(urls, ref, config) {
    const { retries = 3, delay = 1_000 } = config.retryConfig || {};
    const retryRequest = async (targetUrl) => {
        for (let attempt = 1; attempt <= retries; attempt += 1) {
            try {
                return await getFinalUrl(targetUrl, ref, config.axiosConfig);
            }
            catch (error) {
                if (attempt === retries)
                    throw error;
                await new Promise((resolve) => setTimeout(resolve, delay + Math.random() * 200));
            }
        }
        return "";
    };
    const requests = urls.map((targetUrl) => retryRequest(targetUrl));
    const responses = await Promise.allSettled(requests);
    return responses.map((response) => (response.status === "fulfilled" ? response.value : ""));
}
