FROM node:18-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS deps
COPY package*.json ./
RUN npm install --omit=dev

FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 5001

CMD ["npm", "start"]
