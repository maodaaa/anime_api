import type { Context, Next } from "hono";
import type { Payload } from "@helpers/payload";
import { defaultTTL, cache } from "@libs/lruCache";
import path from "path";

function createCacheKey(c: Context): string {
  try {
    const url = new URL(c.req.url);

    return path.join(url.pathname, "/").replace(/\\/g, "/");
  } catch (error) {
    return path.join(c.req.path, "/").replace(/\\/g, "/");
  }
}

export function serverCache(ttl?: number, responseType: "json" | "text" = "json") {
  return async (c: Context, next: Next) => {
    const newTTL = ttl ? 1000 * 60 * ttl : defaultTTL;
    const key = createCacheKey(c);
    const cachedData = cache.get(key);

    if (cachedData) {
      if (responseType === "json") {
        const payload = cachedData as Payload;
        return c.json(payload, payload.statusCode ?? 200);
      }

      if (typeof cachedData === "string") {
        return c.body(cachedData);
      }

      return c.body(String(cachedData));
    }

    await next();

    if (!c.res || c.res.status >= 399) {
      return;
    }

    try {
      if (responseType === "json") {
        const cloned = c.res.clone();
        const body = (await cloned.json()) as Payload;

        if (body && typeof body === "object" && body.ok) {
          cache.set(key, body, { ttl: newTTL });
        }
      } else {
        const cloned = c.res.clone();
        const body = await cloned.text();

        cache.set(key, body, { ttl: newTTL });
      }
    } catch (error) {
      // ignore caching errors
    }
  };
}

export function clientCache(maxAge?: number) {
  return async (c: Context, next: Next) => {
    c.header("Cache-Control", `public, max-age=${maxAge ? maxAge * 60 : 60}`);

    await next();
  };
}
