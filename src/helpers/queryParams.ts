import type { Context } from "hono";
import { setResponseError } from "./error";

function setErrorMessage(key: string, validValue: string[]): string {
  return `masukkan query parameter: ?${key}=${validValue.join("|")}`;
}

export function getOrderParam(c: Context): string {
  const order = c.req.query("order");
  const orders = ["title", "title-reverse", "update", "latest", "popular"];

  if (typeof order === "string") {
    if (orders.includes(order)) {
      if (order === "title-reverse") return "titlereverse";

      return order;
    } else {
      setResponseError(400, setErrorMessage("order", orders));
    }
  }

  return "title";
}

export function getPageParam(c: Context): number {
  const pageParam = c.req.query("page");
  const page = Number(pageParam) || 1;
  const error = {
    status: 400,
    message: setErrorMessage("page", ["number +"]),
  };

  if (page < 1) setResponseError(error.status, error.message);

  if (isNaN(Number(pageParam)) && pageParam !== undefined) {
    setResponseError(error.status, error.message);
  }

  return page;
}

export function getQParam(c: Context): string {
  const q = c.req.query("q");

  if (q === undefined) {
    setResponseError(400, setErrorMessage("q", ["string"]));
  }

  if (typeof q === "string") return q;

  return "";
}

export function getUrlParam(c: Context): string {
  const url = c.req.query("url");

  if (!url) {
    setResponseError(400, setErrorMessage("url", ["string"]));
  }

  if (typeof url === "string") return url;

  return "";
}
