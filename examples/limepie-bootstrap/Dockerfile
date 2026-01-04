# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files for dependency installation
# First, copy the validator/js package
COPY validator/js/package*.json ./validator/js/
COPY validator/js/tsconfig.json ./validator/js/
COPY validator/js/src ./validator/js/src/

# Copy the react package
COPY react/package*.json ./react/
COPY react/tsconfig.json ./react/
COPY react/src ./react/src/

# Copy the limepie-bootstrap demo
COPY examples/limepie-bootstrap/package*.json ./examples/limepie-bootstrap/
COPY examples/limepie-bootstrap/tsconfig.json ./examples/limepie-bootstrap/
COPY examples/limepie-bootstrap/vite.config.ts ./examples/limepie-bootstrap/
COPY examples/limepie-bootstrap/index.html ./examples/limepie-bootstrap/
COPY examples/limepie-bootstrap/src ./examples/limepie-bootstrap/src/
COPY examples/limepie-bootstrap/public ./examples/limepie-bootstrap/public/

# Build @limepie/form-validator
WORKDIR /app/validator/js
RUN rm -rf node_modules package-lock.json && npm install && npm run build

# Build @limepie/form-react
WORKDIR /app/react
# Update package.json to use local path for validator
RUN sed -i 's|"@limepie/form-validator": "\^1.0.0"|"@limepie/form-validator": "file:../validator/js"|g' package.json
RUN rm -rf node_modules package-lock.json && npm install && npm run build

# Build the limepie-bootstrap demo
WORKDIR /app/examples/limepie-bootstrap
# The demo already uses file: reference for @limepie/form-react
RUN rm -rf node_modules package-lock.json && npm install && npm run build

# Production stage - serve with nginx
FROM nginx:alpine AS production

# Copy built files to nginx
COPY --from=builder /app/examples/limepie-bootstrap/dist /usr/share/nginx/html

# Copy public assets (including validate.js)
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
