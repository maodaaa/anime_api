import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { load, type CheerioAPI } from "cheerio";
import path from "path";
import animeConfig from "@configs/animeConfig";
import { setResponseError } from "@helpers/error";
import { createFetcher, warmup } from "@services/dataFetcher";

interface RobotsRules {
  allow: string[];
  disallow: string[];
}

export interface AnimeScraperHttpOptions {
  origin?: string;
  referer?: string;
  headersExtra?: Record<string, string>;
  warmupPath?: string;
  timeoutMs?: number;
}

interface RequestOptions {
  skipRobotsCheck?: boolean;
}

const { scraper } = animeConfig;

export default class AnimeScraper {
  protected baseUrl: string;
  protected baseUrlPath: string;

  private readonly httpOptions: AnimeScraperHttpOptions;
  private httpClientPromise?: Promise<AxiosInstance>;
  private robotsPromise?: Promise<void>;
  private robotsRules: RobotsRules | null = null;
  private warmupCompleted = false;

  constructor(baseUrl: string, baseUrlPath: string, httpOptions?: AnimeScraperHttpOptions) {
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

        if (!this.warmupCompleted && this.httpOptions.warmupPath) {
          await warmup(client, this.httpOptions.warmupPath);
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
    return client.request<T>(config);
  }

  protected async request<T = any>(config: AxiosRequestConfig, options?: RequestOptions): Promise<T> {
    const response = await this.requestRaw<T>(config, options);
    return response.data;
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
    },
    parser: ($: CheerioAPI, data: T) => Promise<T>
  ): Promise<T> {
    const path = this.generateUrlPath([props.path]);
    const html = await this.request<string>(
      {
        url: path,
        method: "GET",
        responseType: "text",
        transformResponse: (data) => data,
        ...props.axiosConfig,
      },
      { skipRobotsCheck: false }
    );

    const $ = load(html);
    const data = parser($, this.deepCopy(props.initialData));

    return data;
  }
}
