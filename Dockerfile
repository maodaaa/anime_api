FROM oven/bun:1 AS builder

WORKDIR /usr/src/app

COPY package.json bun.lockb* ./
RUN bun install

COPY . .

RUN bun run build

FROM oven/bun:1 AS runner

WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/dist ./dist
COPY package.json bun.lockb* ./

RUN bun install --frozen-lockfile --production

EXPOSE 3001

CMD ["bun", "dist/index.js"]
