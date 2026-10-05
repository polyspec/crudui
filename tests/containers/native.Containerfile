FROM rust:1.98.1-slim-trixie@sha256:4cd829461bd5c4d511c32e269da9cb8929223b666519d8004e35fc8d1d771ab7 AS rust
# The components that rust-toolchain.toml names; rustup installs nothing on a later cargo.
RUN rustup component add rustfmt clippy
FROM golang:1.27.0-trixie@sha256:df98008ecd2b0ecc9f0a94d1b07e3564a9c92b555369b33d9b5f60d0765b2db7 AS go
FROM node:26.8.1-trixie-slim@sha256:c0753125a3789977aefe869cbebccf70e3cfd7ea84ca48547458f02e4f1d7146 AS node
FROM composer:2.10.3@sha256:af98f42dfff7c68ba8d53c2164fd9fde1087b7d449514baa38c418b1f6bc4bac AS composer
# The PHP release of config/toolchain.json with its development headers and php-config; Debian has no package of it.
FROM php:8.5.11-cli-trixie@sha256:19642e172d3a542225225e202ddc2c11f67bdcbddf147b676c49338609b9290f

# Debian packages from the snapshot of one date, so the same definition installs the same packages on every date.
RUN sed -i -e 's#http://deb.debian.org/debian-security#http://snapshot.debian.org/archive/debian-security/20261005T000000Z#' \
      -e 's#http://deb.debian.org/debian#http://snapshot.debian.org/archive/debian/20261005T000000Z#' \
      /etc/apt/sources.list.d/debian.sources \
    && printf 'Acquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/10snapshot
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential git ca-certificates unzip chromium \
    && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=composer /usr/bin/composer /usr/local/bin/composer
# The npm release that packageManager of package.json records (tests/build/runtime-version-policy.test.mjs).
RUN node /usr/local/lib/node_modules/npm/bin/npm-cli.js install -g npm@12.2.0
COPY --from=rust /usr/local/cargo /usr/local/cargo
COPY --from=rust /usr/local/rustup /usr/local/rustup
COPY --from=go /usr/local/go /usr/local/go
RUN useradd --create-home --uid 1000 --shell /bin/sh node
ENV CARGO_HOME=/home/node/.cargo \
    RUSTUP_AUTO_INSTALL=0 \
    GOTOOLCHAIN=local \
    COMPOSER_ROOT_VERSION=0.0.1 \
    RUSTUP_HOME=/usr/local/rustup \
    PATH=/usr/local/cargo/bin:/usr/local/go/bin:$PATH \
    PHP_EXTENSION_PHP_CONFIG=/usr/local/bin/php-config \
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
