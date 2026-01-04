# PHP API Dockerfile for FormSpec Validation API
#
# Build from project root:
#   docker build -f examples/php-api/Dockerfile -t formspec-php-api .
#
# Or build from this directory with validator copied:
#   cp -r ../../validator/php ./validator-php
#   docker build -t formspec-php-api .
#
# Run:
#   docker run -p 8080:80 formspec-php-api

FROM php:8.2-apache

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

# Configure Apache to allow .htaccess overrides
RUN sed -i '/<Directory \/var\/www\/>/,/<\/Directory>/ s/AllowOverride None/AllowOverride All/' /etc/apache2/apache2.conf

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Set working directory
WORKDIR /var/www/html

# Copy validator package first (for composer path repository)
# When building from project root: validator/php -> /var/www/validator/php
COPY validator/php /var/www/validator/php

# Copy application files
COPY examples/php-api/ .

# Update composer.json to use correct validator path in container
RUN sed -i 's|../../validator/php|/var/www/validator/php|g' composer.json

# Install dependencies
RUN composer install --no-dev --optimize-autoloader --no-interaction

# Set permissions
RUN chown -R www-data:www-data /var/www/html \
    && chown -R www-data:www-data /var/www/validator \
    && chmod -R 755 /var/www/html

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/ || exit 1

# Start Apache
CMD ["apache2-foreground"]
