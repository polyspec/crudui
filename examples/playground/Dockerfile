# Stage 1: Build dependencies and application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy validator-js package
COPY packages/validator-js/package*.json ./packages/validator-js/
COPY packages/validator-js/tsconfig.json ./packages/validator-js/
COPY packages/validator-js/src ./packages/validator-js/src/

# Copy generator-react package (vite alias resolves its src/ directly)
COPY packages/generator-react/package*.json ./packages/generator-react/
COPY packages/generator-react/tsconfig.json ./packages/generator-react/
COPY packages/generator-react/src ./packages/generator-react/src/

# Copy playground
COPY examples/playground/package*.json ./examples/playground/
COPY examples/playground/tsconfig.json ./examples/playground/
COPY examples/playground/tsconfig.node.json ./examples/playground/
COPY examples/playground/vite.config.ts ./examples/playground/
COPY examples/playground/index.html ./examples/playground/
COPY examples/playground/src ./examples/playground/src/
COPY examples/playground/public ./examples/playground/public/

# Build validator-js
WORKDIR /app/packages/validator-js
RUN rm -rf node_modules package-lock.json && npm install && npm run build

# Build generator-react package (depends on file:../validator-js)
WORKDIR /app/packages/generator-react
RUN rm -rf node_modules package-lock.json && npm install && npm run build

# Build playground (uses file:../../packages/generator-react)
WORKDIR /app/examples/playground
RUN rm -rf node_modules package-lock.json && npm install && npm run build

# Stage 2: Production image with static server
FROM node:20-alpine AS production

WORKDIR /app

# Install serve for static file serving
RUN npm install -g serve

# Copy built files from builder stage
COPY --from=builder /app/examples/playground/dist ./dist

EXPOSE 80

CMD ["serve", "-s", "dist", "-l", "80"]
