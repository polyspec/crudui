# Stage 1: Build dependencies and application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy validator/js package
COPY validator/js ./validator/js

# Copy react package
COPY react ./react

# Copy playground
COPY examples/playground ./examples/playground

# Build validator/js
WORKDIR /app/validator/js
RUN rm -rf node_modules package-lock.json && npm install && npm run build

# Build react package
WORKDIR /app/react
# Update to use local validator
RUN sed -i 's|"@limepie/form-validator": "\^1.0.0"|"@limepie/form-validator": "file:../validator/js"|g' package.json
RUN rm -rf node_modules package-lock.json && npm install && npm run build

# Build playground
WORKDIR /app/examples/playground

# Update package.json to use local packages correctly
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
