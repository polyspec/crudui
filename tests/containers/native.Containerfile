FROM rust:1-slim-trixie AS rust
FROM golang:1.27-trixie AS go
FROM node:26-trixie-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    php8.4-cli php8.4-dev php8.4-mbstring php8.4-xml composer \
    build-essential git ca-certificates unzip chromium \
    && rm -rf /var/lib/apt/lists/*
COPY --from=rust /usr/local/cargo /usr/local/cargo
COPY --from=rust /usr/local/rustup /usr/local/rustup
COPY --from=go /usr/local/go /usr/local/go
ENV CARGO_HOME=/home/node/.cargo \
    RUSTUP_HOME=/usr/local/rustup \
    PATH=/usr/local/cargo/bin:/usr/local/go/bin:$PATH \
    PHP_EXTENSION_PHP_CONFIG=/usr/bin/php-config8.4 \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /workspace
RUN chown node:node /workspace
COPY --chown=node:node . .
USER node
RUN npm ci --strict-allow-scripts \
    && composer install --working-dir=packages/validator-php --no-interaction --prefer-dist \
    && composer install --working-dir=packages/generator-php --no-interaction --prefer-dist \
    && npm run build \
    && node scripts/build-crudui-php-extension.mjs
CMD ["make", "test-native", "NATIVE_REPORT=/tmp/crudui-native-report.json"]
