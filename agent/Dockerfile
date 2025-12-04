From node:20-slim AS builder

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY src ./src
COPY tsconfig.json .

RUN npm run build

#======================

FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

RUN mkdir -p /data

ENV DATA_ROOT=/data

CMD ["node", "dist/agent.js"]