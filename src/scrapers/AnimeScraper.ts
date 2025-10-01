import axios, {
  AxiosHeaders,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";
import { load, type CheerioAPI } from "cheerio";
import path from "path";
// Dynamic import for p-queue will be used in getRequestQueue method
import animeConfig from "@configs/animeConfig";
import { setResponseError } from "@helpers/error";
import {
  createFetcher,
  warmup,
  type UpstreamDiagnostic,
} from "@services/dataFetcher";
import { fetchPageWithBrowser } from "@services/browserFetcher";

interface RobotsRules {
  allow: string[];
  disallow: string[];
}

export interface RateLimitOptions {
  maxConcurrent?: number;
  intervalMs?: number;
  intervalCap?: number;
  jitterMs?: number;
}

export interface BrowserFallbackOptions {
  enabled?: boolean;
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
  navigationTimeoutMs?: number;
  headless?: boolean;
  userAgent?: string;
}

export interface AnimeScraperHttpOptions {
  origin?: string;
  referer?: string;
  headersExtra?: Record<string, string>;
  warmupPath?: string;
  warmupPaths?: string[];
  timeoutMs?: number;
  rateLimit?: RateLimitOptions;
  browserFallback?: BrowserFallbackOptions;
  label?: string;
}

interface RequestOptions {
  skipRobotsCheck?: boolean;
}

const { scraper } = animeConfig;

export default class AnimeScraper {
  protected baseUrl: string;
  protected baseUrlPath: string;

  private readonly httpOptions: AnimeScraperHttpOptions;
  private readonly warmupPaths: string[];
  private readonly rateLimitOptions?: RateLimitOptions;
  private readonly browserFallbackConfig: {
    enabled: boolean;
    waitUntil: "load" | "domcontentloaded" | "networkidle";
    navigationTimeoutMs: number;
    headless: boolean;
    userAgent?: string;
  };
  private readonly label?: string;
  private httpClientPromise?: Promise<AxiosInstance>;
  private robotsPromise?: Promise<void>;
  private robotsRules: RobotsRules | null = null;
  private warmupCompleted = false;
  private requestQueue?: any;

  constructor(baseUrl: string, baseUrlPath: string, httpOptions?: AnimeScraperHttpOptions) {
    this.baseUrl = this.generateBaseUrl(baseUrl);
    this.baseUrlPath = this.generateUrlPath([baseUrlPath]);
    this.httpOptions = {
      origin: httpOptions?.origin ?? this.baseUrl,
      referer: httpOptions?.referer ?? `${this.baseUrl}/`,
      headersExtra: httpOptions?.headersExtra,
      warmupPath: httpOptions?.warmupPath,
      warmupPaths: httpOptions?.warmupPaths,
      timeoutMs: httpOptions?.timeoutMs,
      rateLimit: httpOptions?.rateLimit,
      browserFallback: httpOptions?.browserFallback,
      label: httpOptions?.label,
    };
    const warmupCandidates = [
      ...(httpOptions?.warmupPaths ?? []),
      ...(httpOptions?.warmupPath ? [httpOptions.warmupPath] : []),
    ].filter((value): value is string => typeof value === "string" && value.length > 0);
    this.warmupPaths = warmupCandidates.length > 0 ? warmupCandidates : [];
    const configuredRateLimit = httpOptions?.rateLimit
      ? { ...httpOptions.rateLimit }
      : undefined;
    if (configuredRateLimit && configuredRateLimit.jitterMs === undefined) {
      configuredRateLimit.jitterMs = animeConfig.scraper?.defaultRateLimit?.jitterMs;
    }
    this.rateLimitOptions = configuredRateLimit;
    const browserFallbackDefaults = animeConfig.scraper?.browserFallback ?? {};
    const enabled =
      httpOptions?.browserFallback?.enabled ?? browserFallbackDefaults.enabled ?? false;
    this.browserFallbackConfig = {
      enabled,
      waitUntil:
        httpOptions?.browserFallback?.waitUntil ??
        browserFallbackDefaults.waitUntil ??
        "domcontentloaded",
      navigationTimeoutMs:
        httpOptions?.browserFallback?.navigationTimeoutMs ??
        browserFallbackDefaults.navigationTimeoutMs ??
        25_000,
      headless:
        httpOptions?.browserFallback?.headless ??
        browserFallbackDefaults.headless ??
        true,
      userAgent:
        httpOptions?.browserFallback?.userAgent ??
        browserFallbackDefaults.userAgent,
    };
    this.label = httpOptions?.label;
  }

  private async getRequestQueue(): Promise<any | undefined> {
    if (!this.rateLimitOptions) return undefined;
    if (this.requestQueue) return this.requestQueue;

    const {
      maxConcurrent = 1,
      intervalMs,
      intervalCap,
    } = this.rateLimitOptions;

    // Import p-queue (CommonJS compatible version)
    const PQueue = require("p-queue").default;

    const queue = new PQueue({
      concurrency: Math.max(1, maxConcurrent),
      ...(intervalMs && intervalMs > 0
        ? {
          interval: intervalMs,
          intervalCap: intervalCap ?? Math.max(1, maxConcurrent),
          carryoverConcurrencyCount: true,
        }
        : {}),
    });

    this.requestQueue = queue;
    return queue;
  }

  private async applyRateLimitDelay(): Promise<void> {
    const jitter = this.rateLimitOptions?.jitterMs ?? 0;
    if (jitter <= 0) return;

    const waitFor = Math.random() * jitter;
    if (waitFor <= 0) return;

    await new Promise((resolve) => setTimeout(resolve, waitFor));
  }

  private isBrowserFallbackEnabled(): boolean {
    return this.browserFallbackConfig.enabled === true;
  }

  private getRequestLabel(config: AxiosRequestConfig): string {
    const suffix = config.url ?? this.baseUrlPath ?? "";
    return this.label ? `${this.label}:${suffix}` : suffix;
  }

  private shouldAttemptBrowserFallback(error: unknown): error is typeof error {
    if (!this.isBrowserFallbackEnabled()) return false;
    if (!axios.isAxiosError(error)) return false;
    const upstream: UpstreamDiagnostic | undefined = error.upstream;
    if (!upstream) return false;

    return ["browser_challenge", "bot_block", "geo_block"].includes(upstream.reason);
  }

  private async tryBrowserFallbackFetch(
    resolvedUrl: string,
    config: AxiosRequestConfig,
    requestLabel?: string
  ): Promise<string | undefined> {
    try {
      const sourceHeaders =
        config.headers instanceof AxiosHeaders
          ? config.headers
          : AxiosHeaders.from((config.headers ?? {}) as any);

      const sanitizedHeaders: Record<string, string> = {};
      const jsonHeaders = sourceHeaders.toJSON() as Record<string, unknown>;
      for (const [key, value] of Object.entries(jsonHeaders)) {
        if (value === undefined || value === null) continue;
        sanitizedHeaders[key] = Array.isArray(value) ? value.join(", ") : String(value);
      }

      const html = await fetchPageWithBrowser({
        url: resolvedUrl,
        referer: this.httpOptions.referer,
        userAgent: this.browserFallbackConfig.userAgent,
        waitUntil: this.browserFallbackConfig.waitUntil,
        timeoutMs: this.browserFallbackConfig.navigationTimeoutMs,
        headless: this.browserFallbackConfig.headless,
        headers: sanitizedHeaders,
        label: requestLabel ?? this.getRequestLabel(config),
      });

      return html ?? undefined;
    } catch (error) {
      return undefined;
    }
  }

  private attachDiagnostics(error: unknown, config: AxiosRequestConfig): void {
    if (!axios.isAxiosError(error)) return;
    const upstream = error.upstream;
    if (!upstream) return;

    const resolvedUrl = this.resolveRequestUrl(config);
    if (resolvedUrl) {
      upstream.url = resolvedUrl;
    }
    upstream.method = (config.method ?? "GET").toUpperCase();
    upstream.requestLabel = this.getRequestLabel(config);
  }

  private deepCopy<T>(obj: T): T {
    if (obj === null || typeof obj !== "object") return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => this.deepCopy(item)) as unknown as T;
    }

    const result: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        result[key] = this.deepCopy((obj as any)[key]);
      }
    }

    return result as T;
  }

  private generateBaseUrl(baseUrl: string): string {
    let hapusDariBelakang = true;

    while (hapusDariBelakang) {
      if (baseUrl[baseUrl.length - 1] === "/") {
        baseUrl = baseUrl.slice(0, baseUrl.length - 1);
      } else {
        hapusDariBelakang = false;
      }
    }

    return baseUrl;
  }

  private generateUrlPath(paths: string[]): string {
    let urlPath = path.join("/", ...paths).replace(/\\/g, "/");
    let hapusDariBelakang = true;

    while (hapusDariBelakang) {
      if (urlPath.endsWith("/")) {
        urlPath = urlPath.slice(0, -1);
      } else {
        hapusDariBelakang = false;
      }
    }

    return urlPath;
  }

  private generateUrl(baseUrl: string, urlOrPath?: string): string {
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

  private async getHttpClient(): Promise<AxiosInstance> {
    if (!this.httpClientPromise) {
      this.httpClientPromise = (async () => {
        const { client } = createFetcher({
          baseURL: this.baseUrl,
          origin: this.httpOptions.origin,
          referer: this.httpOptions.referer,
          headersExtra: this.httpOptions.headersExtra,
          timeoutMs: this.httpOptions.timeoutMs,
        });

        if (!this.warmupCompleted && this.warmupPaths.length > 0) {
          for (const warmupPath of this.warmupPaths) {
            try {
              await warmup(client, warmupPath);
            } catch (error) {
              // Ignore warmup errors; diagnostics are handled on demand
            }
            await this.applyRateLimitDelay();
          }
          this.warmupCompleted = true;
        }

        return client;
      })();
    }

    return this.httpClientPromise;
  }

  private shouldRespectRobots(): boolean {
    return scraper?.respectRobotsTxt !== false;
  }

  private async ensureRobots(client: AxiosInstance): Promise<void> {
    if (!this.shouldRespectRobots()) return;
    if (this.robotsPromise) {
      await this.robotsPromise;
      return;
    }

    this.robotsPromise = (async () => {
      try {
        const response = await client.get<string>("/robots.txt", {
          responseType: "text",
          transformResponse: (data) => data,
          headers: {
            Accept: "text/plain",
          },
        });

        if (typeof response.data === "string") {
          this.robotsRules = this.parseRobots(response.data);
        }
      } catch (error) {
        this.robotsRules = null;
      }
    })();

    await this.robotsPromise;
  }

  private parseRobots(content: string): RobotsRules {
    const rules: RobotsRules = { allow: [], disallow: [] };
    const lines = content.split(/\r?\n/);
    let appliesToAll = false;

    for (const rawLine of lines) {
      const line = rawLine.split("#")[0]?.trim();
      if (!line) continue;

      const [directiveRaw, valueRaw = ""] = line.split(":");
      const directive = directiveRaw.trim().toLowerCase();
      const value = valueRaw.trim();

      if (directive === "user-agent") {
        appliesToAll = value === "*";
        continue;
      }

      if (!appliesToAll) continue;

      if (directive === "disallow") {
        if (value) rules.disallow.push(value);
        continue;
      }

      if (directive === "allow") {
        if (value) rules.allow.push(value);
      }
    }

    return rules;
  }

  private matchesRule(pathname: string, rule: string): boolean {
    if (!rule) return false;
    try {
      const pattern = rule
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*");
      const regex = new RegExp(`^${pattern}`);

      return regex.test(pathname);
    } catch (error) {
      return pathname.startsWith(rule);
    }
  }

  private isPathAllowed(pathname: string): boolean {
    if (!this.robotsRules) return true;

    const { allow, disallow } = this.robotsRules;

    const findLongestMatch = (rules: string[]): number => {
      let longest = -1;

      for (const rule of rules) {
        if (!rule) continue;
        if (this.matchesRule(pathname, rule)) {
          if (rule.length > longest) longest = rule.length;
        }
      }

      return longest;
    };

    const longestDisallow = findLongestMatch(disallow);
    if (longestDisallow < 0) return true;

    const longestAllow = findLongestMatch(allow);

    return longestAllow >= longestDisallow;
  }

  private resolveRequestUrl(config: AxiosRequestConfig): string | null {
    if (config.url?.startsWith("http")) return config.url;

    const base = config.baseURL ?? this.baseUrl;
    if (!config.url) return base ?? null;

    if (!base) return config.url;

    try {
      const resolved = new URL(config.url, base.endsWith("/") ? base : `${base}/`);
      return resolved.toString();
    } catch (error) {
      return `${base}${config.url}`;
    }
  }

  private async enforceRobots(config: AxiosRequestConfig): Promise<void> {
    if (!this.shouldRespectRobots()) return;

    const client = await this.getHttpClient();
    await this.ensureRobots(client);

    if (!this.robotsRules) return;

    const resolvedUrl = this.resolveRequestUrl(config);
    if (!resolvedUrl) return;

    let pathname = "";
    try {
      const parsed = new URL(resolvedUrl);
      if (parsed.origin !== new URL(this.baseUrl).origin) return;
      pathname = parsed.pathname || "/";
    } catch (error) {
      return;
    }

    if (!this.isPathAllowed(pathname)) {
      setResponseError(403, `Akses ke ${pathname} diblokir oleh robots.txt`);
    }
  }

  protected async requestRaw<T = any>(
    config: AxiosRequestConfig,
    options?: RequestOptions
  ): Promise<AxiosResponse<T, any>> {
    if (!options?.skipRobotsCheck) {
      await this.enforceRobots(config);
    }

    const client = await this.getHttpClient();
    const executeRequest: () => Promise<AxiosResponse<T, any>> = async () => {
      await this.applyRateLimitDelay();
      return client.request<T>(config);
    };

    const queue = await this.getRequestQueue();
    if (queue) {
      const response = await queue.add(executeRequest);
      return response as AxiosResponse<T, any>;
    }

    return executeRequest();
  }

  protected async request<T = any>(config: AxiosRequestConfig, options?: RequestOptions): Promise<T> {
    try {
      const response = await this.requestRaw<T>(config, options);
      return response.data;
    } catch (error) {
      this.attachDiagnostics(error, config);
      throw error;
    }
  }

  protected str(string?: string): string {
    return string?.trim() || "";
  }

  protected num(string?: string): number | null {
    return Number(string?.trim()) || null;
  }

  protected generateSlug(url?: string): string {
    if (typeof url !== "string") return "";

    const urlArr = url.split("/").filter((url) => url !== "");

    return urlArr[urlArr.length - 1]?.trim() || "";
  }

  protected generateSourceUrl(urlOrPath?: string): string | undefined {
    if (animeConfig.response.sourceUrl) {
      return this.generateUrl(this.baseUrl, urlOrPath);
    }

    return undefined;
  }

  protected generateHref(...paths: string[]): string | undefined {
    if (animeConfig.response.href) {
      return this.generateUrlPath([this.baseUrlPath, ...paths]);
    }

    return undefined;
  }

  protected generateSrcFromIframeTag(html?: string): string {
    const iframeMatch = html?.match(/<iframe[^>]+src="([^"]+)"/i);
    const src = iframeMatch ? iframeMatch[1] : "No iframe found";

    return src;
  }

  protected toCamelCase(str: string): string {
    return str
      .split(" ")
      .map((item, index) => {
        if (index === 0) {
          item = item.toLowerCase();
        } else {
          item = item[0].toUpperCase() + item.slice(1);
        }

        return item;
      })
      .join(" ")
      .replace(/[!@#$%^&*]| /g, "");
  }

  protected checkEmptyData(errorCondition: boolean): void {
    if (errorCondition) setResponseError(404, "data tidak ditemukan");
  }

  protected enrawr(input: string): string {
    let chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let shift = 5;
    let encoded = "";

    for (let i = 0; i < input.length; i++) {
      let char = input[i];
      let index = chars.indexOf(char);

      if (index !== -1) {
        let newIndex = (index + shift) % chars.length;

        encoded += chars[newIndex];
      } else {
        encoded += char;
      }
    }

    return encoded;
  }

  protected derawr(enrawr: string): string {
    let chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let shift = 5;
    let decoded = "";

    for (let i = 0; i < enrawr.length; i++) {
      let char = enrawr[i];
      let index = chars.indexOf(char);

      if (index !== -1) {
        let newIndex = (index - shift + chars.length) % chars.length;
        decoded += chars[newIndex];
      } else {
        decoded += char;
      }
    }

    return decoded;
  }

  protected async scrape<T>(
    props: {
      path: string;
      initialData: T;
      axiosConfig?: AxiosRequestConfig<any>;
      allowBrowserFallback?: boolean;
      preferBrowser?: boolean;
      requestLabel?: string;
    },
    parser: ($: CheerioAPI, data: T) => Promise<T>
  ): Promise<T> {
    const path = this.generateUrlPath([props.path]);
    const allowBrowserFallback = props.allowBrowserFallback ?? true;
    const preferBrowser = props.preferBrowser ?? false;

    const requestConfig: AxiosRequestConfig = {
      url: path,
      method: "GET",
      responseType: "text",
      transformResponse: (data) => data,
      ...props.axiosConfig,
    };

    let html: string | undefined;

    if (preferBrowser && this.isBrowserFallbackEnabled() && allowBrowserFallback) {
      const resolvedUrl = this.resolveRequestUrl(requestConfig);
      if (resolvedUrl) {
        html = await this.tryBrowserFallbackFetch(resolvedUrl, requestConfig, props.requestLabel);
      }
    }

    if (!html) {
      try {
        html = await this.request<string>(requestConfig, { skipRobotsCheck: false });
      } catch (error) {
        this.attachDiagnostics(error, requestConfig);
        if (allowBrowserFallback && this.shouldAttemptBrowserFallback(error)) {
          const resolvedUrl = this.resolveRequestUrl(requestConfig);
          if (resolvedUrl) {
            const fallbackHtml = await this.tryBrowserFallbackFetch(
              resolvedUrl,
              requestConfig,
              props.requestLabel
            );
            if (fallbackHtml) {
              html = fallbackHtml;
            }
          }
        }

        if (html === undefined) {
          throw error;
        }
      }
    }

    if (typeof html !== "string" || html.length === 0) {
      setResponseError(502, "upstream tidak mengirimkan konten");
    }

    const $ = load(html);
    const data = parser($, this.deepCopy(props.initialData));

    return data;
  }
}
