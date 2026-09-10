FROM node:26-trixie-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci --strict-allow-scripts && npm run build
COPY examples/legacy/playground ./examples/legacy/playground
WORKDIR /app/examples/legacy/playground
RUN npm ci --strict-allow-scripts && npm run build

FROM node:26-alpine AS production

WORKDIR /app

# Install serve for static file serving
RUN npm install -g serve

# Copy built files from builder stage
COPY --from=builder /app/examples/legacy/playground/dist ./dist

EXPOSE 80

CMD ["serve", "-s", "dist", "-l", "80"]
