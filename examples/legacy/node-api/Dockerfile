FROM node:26.8.1-trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci && npm run build
COPY examples/legacy/node-api ./examples/legacy/node-api
WORKDIR /app/examples/legacy/node-api
RUN npm ci
EXPOSE 3000
CMD ["npm", "start"]
