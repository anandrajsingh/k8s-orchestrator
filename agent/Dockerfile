From node:18-slim

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY agent.js .

ENV NODE_ENV=production

CMD ["node", "agent.js"]