FROM node:25-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY src ./src

EXPOSE 3333

ENV NODE_ENV=production
ENV PORT=3333

USER node

CMD ["node", "src/index.js"]
