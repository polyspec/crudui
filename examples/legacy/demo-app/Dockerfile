FROM node:26.8.1-trixie-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci && npm run build
COPY examples/legacy/demo-app ./examples/legacy/demo-app
WORKDIR /app/examples/legacy/demo-app
RUN npm ci && npm run build

FROM nginx:alpine AS production

# Copy built files to nginx
COPY --from=builder /app/examples/legacy/demo-app/dist /usr/share/nginx/html

# Copy nginx configuration for SPA routing
RUN echo 'server { \
    listen 80; \
    server_name localhost; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ { \
        expires 1y; \
        add_header Cache-Control "public, immutable"; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
