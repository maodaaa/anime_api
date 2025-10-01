import axios from "axios";
import type { NextFunction, Request, Response } from "express";
import generatePayload from "@helpers/payload";

function resolveTargetUrl(error: any): string {
  const config = error?.config || {};
  const baseURL: string | undefined = config.baseURL;
  const url: string | undefined = config.url;

  if (url?.startsWith("http")) return url;
  if (baseURL && url) {
    try {
      const resolved = new URL(url, baseURL.endsWith("/") ? baseURL : `${baseURL}/`);
      return resolved.toString();
    } catch (err) {
      return `${baseURL}${url}`;
    }
  }

  return url || baseURL || "";
}

function buildAxiosMessage(error: any): string {
  const status = error?.response?.status;
  const targetUrl = resolveTargetUrl(error);

  if (status === 403) {
    return `Permintaan diblokir oleh sumber upstream (${targetUrl}). Kemungkinan sistem anti-bot mendeteksi aktivitas otomatis.`;
  }

  if (status === 429) {
    return `Sumber upstream (${targetUrl}) meminta jeda (HTTP 429). Silakan coba lagi setelah beberapa saat.`;
  }

  return error?.message || "Terjadi kesalahan pada permintaan upstream.";
}

export default function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status ?? 500;
    const message = buildAxiosMessage(err);

    return res.status(status).json(generatePayload(res, { message }));
  }

  if (typeof err.status === "number") {
    return res.status(err.status).json(generatePayload(res, { message: err.message }));
  }

  res.status(500).json(generatePayload(res, { message: err.message }));
}
