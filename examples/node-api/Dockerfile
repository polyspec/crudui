# Node.js API for Form Validator
FROM node:20-alpine

WORKDIR /app

# Copy the validator/js package first
COPY validator/js /app/validator/js

# Build the validator package
WORKDIR /app/validator/js
RUN npm install && npm run build

# Copy the node-api application
WORKDIR /app/node-api
COPY examples/node-api/package.json ./
COPY examples/node-api/server.js ./
COPY examples/node-api/specs ./specs

# Update package.json to use the correct local path for the validator
RUN sed -i 's|file:../../validator/js|file:/app/validator/js|g' package.json

# Install dependencies
RUN npm install

# Expose port 3000
EXPOSE 3000

# Run the Express server
CMD ["npm", "start"]
