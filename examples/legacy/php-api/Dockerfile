# PHP API Dockerfile for CRUDUI Validation API
#
# Build from project root:
#   docker build -f examples/legacy/php-api/Dockerfile -t crudui-php-api .
#
# The validator lives at packages/validator-php (composer path repository).
#
# Run:
#   docker run -p 8080:80 crudui-php-api

FROM php:8.2-apache
ENV COMPOSER_ROOT_VERSION=0.0.1

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    unzip \
    libzip-dev \
    curl \
    && docker-php-ext-install zip \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Enable Apache mod_rewrite and headers
RUN a2enmod rewrite headers

COPY examples/legacy/php-api/apache.conf /etc/apache2/sites-available/000-default.conf

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Set working directory
WORKDIR /var/www/examples/legacy/php-api

# Copy validator package first (for composer path repository)
# When building from project root: packages/validator-php -> /var/www/packages/validator-php
COPY packages/validator-php /var/www/packages/validator-php

# Copy application files
COPY examples/legacy/php-api/ .

# Install dependencies
RUN composer install --no-dev --optimize-autoloader --no-interaction

# Set permissions
RUN chown -R www-data:www-data /var/www/examples/legacy/php-api \
    && chown -R www-data:www-data /var/www/packages \
    && chmod -R 755 /var/www/examples/legacy/php-api

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/ || exit 1

# Start Apache
CMD ["apache2-foreground"]
