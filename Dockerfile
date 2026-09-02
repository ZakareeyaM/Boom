# Multi-stage Dockerfile for BOOM Video Conferencing Platform

FROM node:24-alpine AS builder

WORKDIR /app

# Copy root and workspace package files
COPY package*.json ./
COPY packages/types/package*.json ./packages/types/
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/

# Install all dependencies
RUN npm ci

# Copy full source tree
COPY . .

# Build all packages & apps
RUN npm run build

# Production Runner Stage
FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

# Copy root and workspace metadata
COPY package*.json ./
COPY packages/types/package*.json ./packages/types/
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/

# Install only production dependencies
RUN npm ci --omit=dev

# Copy compiled outputs from builder
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/database ./database

EXPOSE 5000

CMD ["node", "apps/api/dist/index.js"]
