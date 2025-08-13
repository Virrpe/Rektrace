# Multi-stage build for deterministic runtime
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.7.1 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml .npmrc .nvmrc ./
RUN pnpm i --frozen-lockfile
COPY . .
RUN pnpm run build && pnpm prune --prod

FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY ops ./ops
USER app
EXPOSE 8080
CMD ["node","dist/rektrace-rugscan/rektrace-rugscan/src/index.js"]


