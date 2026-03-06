FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY prisma ./prisma/
RUN npx prisma generate

COPY dist ./dist/
COPY src/domains/ui-presets/data ./dist/domains/ui-presets/data

EXPOSE 3000

CMD ["node", "dist/main.js"]
