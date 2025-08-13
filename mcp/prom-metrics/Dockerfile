FROM node:20-alpine AS base
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10

# Copy lockfiles
COPY package.json pnpm-lock.yaml ./

# Install deps (including dev for tsx runner)
RUN pnpm install --frozen-lockfile

# Copy only the MCP server code
COPY mcp/prom-metrics ./mcp/prom-metrics

ENV NODE_ENV=production

# Default Prometheus URL (can be overridden)
ENV PROM_URL=http://prometheus:9090

ENTRYPOINT ["pnpm", "tsx", "mcp/prom-metrics/server.ts"]


