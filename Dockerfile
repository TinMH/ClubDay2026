FROM node:22-bookworm-slim

WORKDIR /app

# Copy root + workspace manifests
COPY package*.json ./
COPY apps/web/package*.json ./apps/web/
COPY apps/server/package*.json ./apps/server/

# Install dependencies
RUN npm ci

# Copy source
COPY . .

# Build frontend + backend
RUN npm run build

EXPOSE 8787

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787

CMD ["npm", "start"]