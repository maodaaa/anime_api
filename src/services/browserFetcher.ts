import animeConfig from "@configs/animeConfig";
import PQueue from "p-queue";

type PlaywrightModule = typeof import("playwright-core");
type BrowserTypeName = "chromium" | "firefox" | "webkit";

type Browser = import("playwright-core").Browser;

export interface BrowserFetchOptions {
  url: string;
  referer?: string;
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
  timeoutMs?: number;
  headers?: Record<string, string>;
  userAgent?: string;
  headless?: boolean;
  label?: string;
}

interface BrowserCacheEntry {
  provider: BrowserTypeName;
  headless: boolean;
  promise: Promise<Browser>;
}

let cachedBrowser: BrowserCacheEntry | null = null;
const browserQueue = new PQueue({ concurrency: 1 });

async function loadPlaywright(): Promise<PlaywrightModule> {
  try {
    return await import("playwright-core");
  } catch (error) {
    throw new Error(
      "playwright-core tidak ditemukan. Instal dependency ini untuk mengaktifkan browser fallback."
    );
  }
}

async function ensureBrowser(
  playwright: PlaywrightModule,
  provider: BrowserTypeName,
  headless: boolean
): Promise<Browser> {
  if (cachedBrowser && cachedBrowser.provider === provider && cachedBrowser.headless === headless) {
    return cachedBrowser.promise;
  }

  const launchPromise = playwright[provider].launch({ headless });
  cachedBrowser = { provider, headless, promise: launchPromise };
  return launchPromise;
}

function buildExtraHeaders(options: BrowserFetchOptions): Record<string, string> {
  const headers: Record<string, string> = {};
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

export async function fetchPageWithBrowser(options: BrowserFetchOptions): Promise<string | undefined> {
  const globalConfig = animeConfig.scraper?.browserFallback;
  if (!globalConfig?.enabled) {
    throw new Error("Browser fallback dimatikan melalui konfigurasi.");
  }

  const provider = (globalConfig.provider ?? "chromium") as BrowserTypeName;
  const headless = options.headless ?? globalConfig.headless ?? true;
  const waitUntil = options.waitUntil ?? globalConfig.waitUntil ?? "domcontentloaded";
  const timeout = options.timeoutMs ?? globalConfig.navigationTimeoutMs ?? 25_000;
  const userAgent = options.userAgent ?? globalConfig.userAgent;

  const result = (await browserQueue.add(async (): Promise<string | undefined> => {
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
    let html: string | undefined;

    try {
      await page.goto(options.url, {
        waitUntil,
        timeout,
        referer: options.referer,
      });

      await page.waitForTimeout(250 + Math.random() * 400);
      html = await page.content();
    } finally {
      await context.close().catch(() => undefined);
    }
    return html;
  })) as string | undefined;

  return result;
}

export async function shutdownBrowser(): Promise<void> {
  if (!cachedBrowser) return;
  try {
    const browser = await cachedBrowser.promise;
    await browser.close();
  } catch (error) {
    // ignore shutdown errors
  } finally {
    cachedBrowser = null;
  }
}
