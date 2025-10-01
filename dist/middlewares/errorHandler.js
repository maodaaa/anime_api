"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = errorHandler;
const axios_1 = __importDefault(require("axios"));
const payload_1 = __importDefault(require("../helpers/payload"));
function resolveTargetUrl(error) {
    const config = error?.config || {};
    const baseURL = config.baseURL;
    const url = config.url;
    if (url?.startsWith("http"))
        return url;
    if (baseURL && url) {
        try {
            const resolved = new URL(url, baseURL.endsWith("/") ? baseURL : `${baseURL}/`);
            return resolved.toString();
        }
        catch (err) {
            return `${baseURL}${url}`;
        }
    }
    return url || baseURL || "";
}
function describeUpstreamBlock(targetUrl, upstream) {
    const provider = upstream?.provider && upstream.provider !== "unknown"
        ? upstream.provider
        : "sumber upstream";
    const context = upstream?.requestLabel ? ` [request: ${upstream.requestLabel}]` : "";
    switch (upstream?.reason) {
        case "browser_challenge":
            return `Permintaan memerlukan verifikasi browser oleh ${provider} (${targetUrl}). Aktifkan SCRAPER_BROWSER_FALLBACK=true untuk menggunakan fallback Playwright atau coba lagi secara manual.${context}`;
        case "bot_block":
            return `Permintaan diblokir oleh ${provider} (${targetUrl}). Kurangi frekuensi permintaan, pastikan header sudah lengkap, atau gunakan fallback browser bila diizinkan.${context}`;
        case "geo_block":
            return `Akses ke ${targetUrl} dibatasi berdasarkan lokasi oleh ${provider}. Layanan tidak dapat meneruskan permintaan ini.${context}`;
        case "rate_limited":
            return `Sumber upstream (${targetUrl}) menerapkan rate limit. Sistem sudah mencoba ulang otomatis, mohon beri jeda sebelum mencoba kembali.${context}`;
        case "maintenance":
            return `Sumber upstream (${targetUrl}) sedang tidak stabil atau dalam perawatan (HTTP ${upstream?.status ?? 503}). Silakan coba lagi nanti.${context}`;
        case "unauthorized":
            return `Permintaan ke ${targetUrl} memerlukan otorisasi tambahan dari ${provider}. Endpoint ini tidak dapat diakses tanpa kredensial yang valid.${context}`;
        case "network":
            return `Permintaan ke ${targetUrl} gagal karena kendala jaringan. Mohon periksa koneksi dan coba ulang.${context}`;
        default:
            return `Permintaan ke ${targetUrl} ditolak oleh sumber upstream.${context}`;
    }
}
function buildAxiosMessage(error) {
    const status = error?.response?.status;
    const targetUrl = resolveTargetUrl(error);
    const upstream = error?.upstream;
    if (upstream) {
        return describeUpstreamBlock(targetUrl, upstream);
    }
    if (status === 429) {
        return `Sumber upstream (${targetUrl}) meminta jeda (HTTP 429). Silakan coba lagi setelah beberapa saat.`;
    }
    return error?.message || "Terjadi kesalahan pada permintaan upstream.";
}
function errorHandler(err, req, res, next) {
    if (axios_1.default.isAxiosError(err)) {
        const status = err.response?.status ?? 500;
        const message = buildAxiosMessage(err);
        return res.status(status).json((0, payload_1.default)(res, { message }));
    }
    if (typeof err.status === "number") {
        return res.status(err.status).json((0, payload_1.default)(res, { message: err.message }));
    }
    res.status(500).json((0, payload_1.default)(res, { message: err.message }));
}
