"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cheerio_1 = require("cheerio");
const path_1 = __importDefault(require("path"));
const animeConfig_1 = __importDefault(require("../configs/animeConfig"));
const error_1 = require("../helpers/error");
const dataFetcher_1 = require("../services/dataFetcher");
const { scraper } = animeConfig_1.default;
class AnimeScraper {
    constructor(baseUrl, baseUrlPath, httpOptions) {
        this.robotsRules = null;
        this.warmupCompleted = false;
        this.baseUrl = this.generateBaseUrl(baseUrl);
        this.baseUrlPath = this.generateUrlPath([baseUrlPath]);
        this.httpOptions = {
            origin: httpOptions?.origin ?? this.baseUrl,
            referer: httpOptions?.referer ?? `${this.baseUrl}/`,
            headersExtra: httpOptions?.headersExtra,
            warmupPath: httpOptions?.warmupPath,
            timeoutMs: httpOptions?.timeoutMs,
        };
    }
    deepCopy(obj) {
        if (obj === null || typeof obj !== "object")
            return obj;
        if (Array.isArray(obj)) {
            return obj.map((item) => this.deepCopy(item));
        }
        const result = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                result[key] = this.deepCopy(obj[key]);
            }
        }
        return result;
    }
    generateBaseUrl(baseUrl) {
        let hapusDariBelakang = true;
        while (hapusDariBelakang) {
            if (baseUrl[baseUrl.length - 1] === "/") {
                baseUrl = baseUrl.slice(0, baseUrl.length - 1);
            }
            else {
                hapusDariBelakang = false;
            }
        }
        return baseUrl;
    }
    generateUrlPath(paths) {
        let urlPath = path_1.default.join("/", ...paths).replace(/\\/g, "/");
        let hapusDariBelakang = true;
        while (hapusDariBelakang) {
            if (urlPath.endsWith("/")) {
                urlPath = urlPath.slice(0, -1);
            }
            else {
                hapusDariBelakang = false;
            }
        }
        return urlPath;
    }
    generateUrl(baseUrl, urlOrPath) {
        if (urlOrPath) {
            if (urlOrPath.includes(baseUrl)) {
                baseUrl = baseUrl + urlOrPath.replace(baseUrl, "");
            }
            if (!urlOrPath.includes(baseUrl)) {
                if (urlOrPath.startsWith("/")) {
                    baseUrl = baseUrl + urlOrPath;
                }
            }
        }
        return baseUrl;
    }
    async getHttpClient() {
        if (!this.httpClientPromise) {
            this.httpClientPromise = (async () => {
                const { client } = (0, dataFetcher_1.createFetcher)({
                    baseURL: this.baseUrl,
                    origin: this.httpOptions.origin,
                    referer: this.httpOptions.referer,
                    headersExtra: this.httpOptions.headersExtra,
                    timeoutMs: this.httpOptions.timeoutMs,
                });
                if (!this.warmupCompleted && this.httpOptions.warmupPath) {
                    await (0, dataFetcher_1.warmup)(client, this.httpOptions.warmupPath);
                    this.warmupCompleted = true;
                }
                return client;
            })();
        }
        return this.httpClientPromise;
    }
    shouldRespectRobots() {
        return scraper?.respectRobotsTxt !== false;
    }
    async ensureRobots(client) {
        if (!this.shouldRespectRobots())
            return;
        if (this.robotsPromise) {
            await this.robotsPromise;
            return;
        }
        this.robotsPromise = (async () => {
            try {
                const response = await client.get("/robots.txt", {
                    responseType: "text",
                    transformResponse: (data) => data,
                    headers: {
                        Accept: "text/plain",
                    },
                });
                if (typeof response.data === "string") {
                    this.robotsRules = this.parseRobots(response.data);
                }
            }
            catch (error) {
                this.robotsRules = null;
            }
        })();
        await this.robotsPromise;
    }
    parseRobots(content) {
        const rules = { allow: [], disallow: [] };
        const lines = content.split(/\r?\n/);
        let appliesToAll = false;
        for (const rawLine of lines) {
            const line = rawLine.split("#")[0]?.trim();
            if (!line)
                continue;
            const [directiveRaw, valueRaw = ""] = line.split(":");
            const directive = directiveRaw.trim().toLowerCase();
            const value = valueRaw.trim();
            if (directive === "user-agent") {
                appliesToAll = value === "*";
                continue;
            }
            if (!appliesToAll)
                continue;
            if (directive === "disallow") {
                if (value)
                    rules.disallow.push(value);
                continue;
            }
            if (directive === "allow") {
                if (value)
                    rules.allow.push(value);
            }
        }
        return rules;
    }
    matchesRule(pathname, rule) {
        if (!rule)
            return false;
        try {
            const pattern = rule
                .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
                .replace(/\*/g, ".*");
            const regex = new RegExp(`^${pattern}`);
            return regex.test(pathname);
        }
        catch (error) {
            return pathname.startsWith(rule);
        }
    }
    isPathAllowed(pathname) {
        if (!this.robotsRules)
            return true;
        const { allow, disallow } = this.robotsRules;
        const findLongestMatch = (rules) => {
            let longest = -1;
            for (const rule of rules) {
                if (!rule)
                    continue;
                if (this.matchesRule(pathname, rule)) {
                    if (rule.length > longest)
                        longest = rule.length;
                }
            }
            return longest;
        };
        const longestDisallow = findLongestMatch(disallow);
        if (longestDisallow < 0)
            return true;
        const longestAllow = findLongestMatch(allow);
        return longestAllow >= longestDisallow;
    }
    resolveRequestUrl(config) {
        if (config.url?.startsWith("http"))
            return config.url;
        const base = config.baseURL ?? this.baseUrl;
        if (!config.url)
            return base ?? null;
        if (!base)
            return config.url;
        try {
            const resolved = new URL(config.url, base.endsWith("/") ? base : `${base}/`);
            return resolved.toString();
        }
        catch (error) {
            return `${base}${config.url}`;
        }
    }
    async enforceRobots(config) {
        if (!this.shouldRespectRobots())
            return;
        const client = await this.getHttpClient();
        await this.ensureRobots(client);
        if (!this.robotsRules)
            return;
        const resolvedUrl = this.resolveRequestUrl(config);
        if (!resolvedUrl)
            return;
        let pathname = "";
        try {
            const parsed = new URL(resolvedUrl);
            if (parsed.origin !== new URL(this.baseUrl).origin)
                return;
            pathname = parsed.pathname || "/";
        }
        catch (error) {
            return;
        }
        if (!this.isPathAllowed(pathname)) {
            (0, error_1.setResponseError)(403, `Akses ke ${pathname} diblokir oleh robots.txt`);
        }
    }
    async requestRaw(config, options) {
        if (!options?.skipRobotsCheck) {
            await this.enforceRobots(config);
        }
        const client = await this.getHttpClient();
        return client.request(config);
    }
    async request(config, options) {
        const response = await this.requestRaw(config, options);
        return response.data;
    }
    str(string) {
        return string?.trim() || "";
    }
    num(string) {
        return Number(string?.trim()) || null;
    }
    generateSlug(url) {
        if (typeof url !== "string")
            return "";
        const urlArr = url.split("/").filter((url) => url !== "");
        return urlArr[urlArr.length - 1]?.trim() || "";
    }
    generateSourceUrl(urlOrPath) {
        if (animeConfig_1.default.response.sourceUrl) {
            return this.generateUrl(this.baseUrl, urlOrPath);
        }
        return undefined;
    }
    generateHref(...paths) {
        if (animeConfig_1.default.response.href) {
            return this.generateUrlPath([this.baseUrlPath, ...paths]);
        }
        return undefined;
    }
    generateSrcFromIframeTag(html) {
        const iframeMatch = html?.match(/<iframe[^>]+src="([^"]+)"/i);
        const src = iframeMatch ? iframeMatch[1] : "No iframe found";
        return src;
    }
    toCamelCase(str) {
        return str
            .split(" ")
            .map((item, index) => {
            if (index === 0) {
                item = item.toLowerCase();
            }
            else {
                item = item[0].toUpperCase() + item.slice(1);
            }
            return item;
        })
            .join(" ")
            .replace(/[!@#$%^&*]| /g, "");
    }
    checkEmptyData(errorCondition) {
        if (errorCondition)
            (0, error_1.setResponseError)(404, "data tidak ditemukan");
    }
    enrawr(input) {
        let chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let shift = 5;
        let encoded = "";
        for (let i = 0; i < input.length; i++) {
            let char = input[i];
            let index = chars.indexOf(char);
            if (index !== -1) {
                let newIndex = (index + shift) % chars.length;
                encoded += chars[newIndex];
            }
            else {
                encoded += char;
            }
        }
        return encoded;
    }
    derawr(enrawr) {
        let chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let shift = 5;
        let decoded = "";
        for (let i = 0; i < enrawr.length; i++) {
            let char = enrawr[i];
            let index = chars.indexOf(char);
            if (index !== -1) {
                let newIndex = (index - shift + chars.length) % chars.length;
                decoded += chars[newIndex];
            }
            else {
                decoded += char;
            }
        }
        return decoded;
    }
    async scrape(props, parser) {
        const path = this.generateUrlPath([props.path]);
        const html = await this.request({
            url: path,
            method: "GET",
            responseType: "text",
            transformResponse: (data) => data,
            ...props.axiosConfig,
        }, { skipRobotsCheck: false });
        const $ = (0, cheerio_1.load)(html);
        const data = parser($, this.deepCopy(props.initialData));
        return data;
    }
}
exports.default = AnimeScraper;
