# ==============================================================================
# Build Stage
# ==============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/
COPY apps/frontend/package*.json ./apps/frontend/

# Install all dependencies (including devDependencies for build)
RUN npm install

# Copy source code and configs
COPY tsconfig.json ./
COPY apps/backend ./apps/backend
COPY apps/frontend ./apps/frontend

# Build backend and frontend
RUN npm run build

# ==============================================================================
# Production Runner Stage
# ==============================================================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3456
ENV HOST=0.0.0.0

# Copy root & backend package files for production dependency installation
COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/

# Install only production dependencies
RUN npm install --omit=dev --workspace=apps/backend

# Copy built artifacts
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/frontend/dist ./apps/frontend/dist

# Create dedicated persistent volume directory
RUN mkdir -p /data && chown -R node:node /data /app

# Switch to non-root node user
USER node

# Declare /data mount point
VOLUME ["/data"]

EXPOSE 3456

CMD ["node", "apps/backend/dist/index.js"]
