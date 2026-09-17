FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

# Build frontend + backend
RUN npm run build

EXPOSE 8787

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787

CMD ["npm", "start"]