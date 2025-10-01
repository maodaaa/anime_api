import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  AxiosHeaders,
} from "axios";
import axiosRetry from "axios-retry";
import crypto from "node:crypto";
import { CookieJar } from "tough-cookie";
import { HttpCookieAgent, HttpsCookieAgent } from "http-cookie-agent/http";

const USER_AGENTS: readonly string[] = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
];

export type UpstreamBlockReason =
  | "browser_challenge"
  | "rate_limited"
  | "bot_block"
  | "geo_block"
  | "unauthorized"
  | "maintenance"
  | "network"
  | "unknown";

export interface UpstreamDiagnostic {
  status?: number;
  reason: UpstreamBlockReason;
  provider?: "cloudflare" | "akamai" | "fastly" | "unknown";
  fingerprint?: string;
  headers?: Record<string, string>;
  snippet?: string;
  url?: string;
  method?: string;
  requestLabel?: string;
}

declare module "axios" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface AxiosError<T = unknown, D = any> {
    upstream?: UpstreamDiagnostic;
  }
}

export interface FetcherOptions {
  baseURL?: string;
  origin?: string;
  referer?: string;
  headersExtra?: Record<string, string>;
  timeoutMs?: number;
  jar?: CookieJar;
}

export interface FetcherContext {
  client: AxiosInstance;
  jar: CookieJar;
}

const fetcherCache = new Map<string, FetcherContext>();

function normalizeHeaders(headers?: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  if (!headers) return normalized;

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null) continue;
    const val = Array.isArray(value) ? value.join(", ") : String(value);
    normalized[key.toLowerCase()] = val;
  }

  return normalized;
}

function extractSnippet(data: unknown): string | undefined {
  if (typeof data === "string") {
    const trimmed = data.trim();
    return trimmed.slice(0, 320);
  }

  if (Buffer.isBuffer(data)) {
    return data.toString("utf8", 0, 320);
  }

  return undefined;
}

function detectProvider(headers: Record<string, string>): UpstreamDiagnostic["provider"] {
  if (headers["cf-ray"] || headers["cf-mitigated"] || headers["server"]?.toLowerCase().includes("cloudflare")) {
    return "cloudflare";
  }

  if (headers["server"]?.toLowerCase().includes("akamai")) {
    return "akamai";
  }

  if (headers["server"]?.toLowerCase().includes("fastly")) {
    return "fastly";
  }

  return "unknown";
}

function analyzeUpstreamError(error: AxiosError): UpstreamDiagnostic | undefined {
  const status = error.response?.status;
  if (!status) return undefined;

  const headers = normalizeHeaders(error.response?.headers as Record<string, unknown> | undefined);
  const snippet = extractSnippet(error.response?.data);
  const provider = detectProvider(headers);

  const fingerprintParts = [String(status)];
  if (headers["cf-ray"]) fingerprintParts.push(headers["cf-ray"]);
  if (headers["server-timing"]) fingerprintParts.push(headers["server-timing"]);
  if (headers["x-envoy-upstream-service-time"]) {
    fingerprintParts.push(`envoy:${headers["x-envoy-upstream-service-time"]}`);
  }

  const fingerprint = fingerprintParts.join("|");

  let reason: UpstreamBlockReason = "unknown";

  if (status === 429 || headers["retry-after"]) {
    reason = "rate_limited";
  } else if (status === 401) {
    reason = "unauthorized";
  } else if ([502, 503, 504].includes(status)) {
    reason = "maintenance";
  } else if (status >= 500) {
    reason = "maintenance";
  } else if (status === 403) {
    const cfMitigated = headers["cf-mitigated"] || "";
    const body = snippet?.toLowerCase() ?? "";

    if (cfMitigated.includes("challenge") || body.includes("cloudflare") || body.includes("cf-chl")) {
      reason = "browser_challenge";
    } else if (body.includes("access denied") || body.includes("blocked") || cfMitigated.includes("bot") || cfMitigated.includes("block")) {
      reason = "bot_block";
    } else if (body.includes("country") && body.includes("restricted")) {
      reason = "geo_block";
    } else {
      reason = "bot_block";
    }
  }

  return {
    status,
    reason,
    provider,
    fingerprint,
    headers: {
      ...(headers["cf-ray"] ? { "cf-ray": headers["cf-ray"] } : {}),
      ...(headers["cf-mitigated"] ? { "cf-mitigated": headers["cf-mitigated"] } : {}),
      ...(headers["retry-after"] ? { "retry-after": headers["retry-after"] } : {}),
      ...(headers["server"] ? { server: headers["server"] } : {}),
    },
    snippet,
    url: error.config?.url,
    method: (error.config?.method ?? "GET").toUpperCase(),
  };
}

function createCookieJar(existing?: CookieJar): CookieJar {
  if (existing) return existing;

  return new CookieJar();
}

function pickUserAgent(seed?: string): string {
  const hash = crypto
    .createHash("sha256")
    .update(seed ?? `${Date.now()}-${Math.random()}`)
    .digest();
  const index = hash[0] % USER_AGENTS.length;

  return USER_AGENTS[index];
}

function buildDefaultHeaders(options: FetcherOptions, ua: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": ua,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
    DNT: "1",
    "Upgrade-Insecure-Requests": "1",
    Pragma: "no-cache",
    "Cache-Control": "no-cache",
    "Sec-Fetch-Site": options.origin ? "same-origin" : "none",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Dest": "document",
    "Sec-Ch-Ua": "\"Not.A/Brand\";v=\"8\", \"Chromium\";v=\"124\", \"Google Chrome\";v=\"124\"",
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": "\"Windows\"",
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

export function createFetcher(options: FetcherOptions = {}): FetcherContext {
  const jar = createCookieJar(options.jar);
  const httpAgent = new HttpCookieAgent({
    cookies: { jar },
    keepAlive: true,
  });
  const httpsAgent = new HttpsCookieAgent({
    cookies: { jar },
    keepAlive: true,
  });

  const client = axios.create({
    baseURL: options.baseURL,
    timeout: options.timeoutMs ?? 15_000,
    httpAgent,
    httpsAgent,
    withCredentials: true,
  });

  axiosRetry(client, {
    retries: 3,
    retryDelay: (retryCount) => {
      const base = axiosRetry.exponentialDelay(retryCount);
      const jitter = Math.floor(Math.random() * 400);

      return base + jitter;
    },
    shouldResetTimeout: true,
    retryCondition: (error) => {
      if (!axiosRetry.isNetworkOrIdempotentRequestError(error)) {
        const status = (error as AxiosError)?.response?.status;
        if (!status) return false;

        return [403, 408, 425, 429, 500, 502, 503, 504].includes(status);
      }

      return true;
    },
  });

  client.interceptors.request.use((config) => {
    const ua = pickUserAgent(options.baseURL ?? options.origin ?? options.referer);
    const existingHeaders =
      config.headers instanceof AxiosHeaders
        ? config.headers.toJSON()
        : AxiosHeaders.from(config.headers ?? {}).toJSON();

    const mergedHeaders = {
      ...buildDefaultHeaders(options, ua),
      ...existingHeaders,
    };

    config.headers = AxiosHeaders.from(mergedHeaders);

    if (config.headers) {
      if (!("Accept-Encoding" in config.headers)) {
        config.headers["Accept-Encoding"] = "gzip, deflate, br";
      }
    }

    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      if (axios.isAxiosError(error)) {
        const diagnostic = analyzeUpstreamError(error);
        if (diagnostic) {
          error.upstream = diagnostic;
        }
      }

      return Promise.reject(error);
    }
  );

  return { client, jar };
}

function resolveFetcherKey(options: FetcherOptions): string {
  const base = options.baseURL ?? options.origin ?? options.referer ?? "default";

  return base;
}

export function getOrCreateFetcher(options: FetcherOptions = {}): FetcherContext {
  const key = resolveFetcherKey(options);
  const existing = fetcherCache.get(key);
  if (existing) return existing;

  const context = createFetcher(options);
  fetcherCache.set(key, context);

  return context;
}

export async function warmup(client: AxiosInstance, url: string): Promise<void> {
  try {
    await client.get(url, {
      responseType: "text",
      transformResponse: (data) => data,
    });
  } catch (error) {
    // Ignore warmup failures – downstream requests will surface real errors
  }
}

export async function getFinalUrl(
  url: string,
  ref: string,
  axiosConfig?: AxiosRequestConfig<any>
): Promise<string> {
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
    } catch (error) {
      return location;
    }
  }

  return url;
}

export async function getFinalUrls(
  urls: string[],
  ref: string,
  config: {
    axiosConfig?: AxiosRequestConfig<any>;
    retryConfig?: {
      retries?: number;
      delay?: number;
    };
  }
): Promise<string[]> {
  const { retries = 3, delay = 1_000 } = config.retryConfig || {};

  const retryRequest = async (targetUrl: string): Promise<string> => {
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        return await getFinalUrl(targetUrl, ref, config.axiosConfig);
      } catch (error) {
        if (attempt === retries) throw error;

        await new Promise((resolve) => setTimeout(resolve, delay + Math.random() * 200));
      }
    }

    return "";
  };

  const requests = urls.map((targetUrl) => retryRequest(targetUrl));
  const responses = await Promise.allSettled(requests);

  return responses.map((response) => (response.status === "fulfilled" ? response.value : ""));
}
