"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const animeConfig = {
    PORT: 3001,
    baseUrl: {
        otakudesu: "https://otakudesu.best",
        samehadaku: "https://v1.samehadaku.how",
    },
    scraper: {
        respectRobotsTxt: true,
    },
    response: {
        href: true,
        sourceUrl: true,
    },
};
exports.default = animeConfig;
