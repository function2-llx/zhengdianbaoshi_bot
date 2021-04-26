FROM node:14
EXPOSE 9140

WORKDIR /app

RUN npm install node-telegram-bot-api
RUN npm install -g typeorm

COPY bot.js token ./

CMD node bot
