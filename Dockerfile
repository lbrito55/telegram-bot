FROM node:22-slim

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm install

# Build the Mastra server
COPY . .
RUN npm run build

ENV NODE_ENV=production

# Mastra server listens on 4111 by default
EXPOSE 4111

CMD ["npm", "start"]
