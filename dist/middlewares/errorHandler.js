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
function buildAxiosMessage(error) {
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
