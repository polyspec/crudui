# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files for dependency installation
# First, copy the validator-js package
COPY packages/validator-js/package*.json ./packages/validator-js/
COPY packages/validator-js/tsconfig.json ./packages/validator-js/
COPY packages/validator-js/src ./packages/validator-js/src/

# Copy the generator-react package
COPY packages/generator-react/package*.json ./packages/generator-react/
COPY packages/generator-react/tsconfig.json ./packages/generator-react/
COPY packages/generator-react/src ./packages/generator-react/src/

# Copy the limepie-bootstrap demo
COPY examples/limepie-bootstrap/package*.json ./examples/limepie-bootstrap/
COPY examples/limepie-bootstrap/tsconfig.json ./examples/limepie-bootstrap/
COPY examples/limepie-bootstrap/vite.config.ts ./examples/limepie-bootstrap/
COPY examples/limepie-bootstrap/index.html ./examples/limepie-bootstrap/
COPY examples/limepie-bootstrap/src ./examples/limepie-bootstrap/src/
COPY examples/limepie-bootstrap/public ./examples/limepie-bootstrap/public/

# Build @form-spec/validator
WORKDIR /app/packages/validator-js
RUN rm -rf node_modules package-lock.json && npm install && npm run build

# Build @form-spec/generator-react
WORKDIR /app/packages/generator-react
RUN rm -rf node_modules package-lock.json && npm install && npm run build

# Build the limepie-bootstrap demo
WORKDIR /app/examples/limepie-bootstrap
RUN rm -rf node_modules package-lock.json && npm install && npm run build

# Production stage - serve with nginx
FROM nginx:alpine AS production

# Copy built files to nginx
COPY --from=builder /app/examples/limepie-bootstrap/dist /usr/share/nginx/html

# Copy public assets
COPY --from=builder /app/examples/limepie-bootstrap/public /usr/share/nginx/html

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
