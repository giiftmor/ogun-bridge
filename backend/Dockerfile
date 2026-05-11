FROM node:25.6.1-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY src ./src

# Create logs directory with proper permissions
RUN mkdir -p /app/logs && chown -R node:node /app

EXPOSE 3333

ENV NODE_ENV=production
ENV PORT=3333

USER node

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3333/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "src/index.js"]
