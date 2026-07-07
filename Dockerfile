# Lakofon — Node 24 (ima ugrađeni node:sqlite)
FROM node:24-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
# Trajni disk (montiraj volume na /data na hostingu da baza i prilozi prežive redeploy)
ENV DATA_DIR=/data

EXPOSE 3000
CMD ["npm", "start"]
