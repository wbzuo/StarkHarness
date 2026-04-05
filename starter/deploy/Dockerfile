FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["node", "--import", "tsx", "src/main.ts", "serve", "--port=3000", "--host=0.0.0.0"]
