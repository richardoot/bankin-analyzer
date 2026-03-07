# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace files from root (including tsconfig.base.json for TypeScript resolution)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./

# Copy frontend package.json
COPY frontend/package.json ./frontend/

# Install dependencies with shamefully-hoist for proper module resolution
RUN pnpm install --shamefully-hoist --filter frontend

# Copy frontend source
COPY frontend/ ./frontend/

# Build args for environment variables
ARG VITE_API_URL=http://localhost:3000
ARG VITE_SUPABASE_URL=http://localhost:8000
ARG VITE_SUPABASE_ANON_KEY

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# Build frontend
WORKDIR /app/frontend
RUN pnpm build

# Production stage
FROM nginx:alpine
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
