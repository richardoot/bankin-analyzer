# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace files from root
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy backend package.json and prisma schema
COPY backend/package.json ./backend/
COPY backend/prisma ./backend/prisma/

# Install dependencies with shamefully-hoist to flatten node_modules for Prisma
RUN pnpm install --shamefully-hoist

# Copy backend source
WORKDIR /app
COPY backend/ ./backend/

# Generate Prisma client
WORKDIR /app/backend
RUN pnpm prisma generate

# Build backend
RUN pnpm build

# Production stage
FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/backend/dist ./dist
# With shamefully-hoist, all deps are in root node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/package.json ./
COPY --from=builder /app/backend/prisma ./prisma

# Entrypoint script for migrations
COPY docker/backend-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
