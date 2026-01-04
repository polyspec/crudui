FROM php:8.2-apache

# Install YAML extension and other dependencies
RUN apt-get update && apt-get install -y \
    libyaml-dev \
    && pecl install yaml \
    && docker-php-ext-enable yaml \
    && rm -rf /var/lib/apt/lists/*

EXPOSE 80
