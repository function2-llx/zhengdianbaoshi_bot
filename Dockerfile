FROM node:15
EXPOSE 9140

WORKDIR /app

RUN npm install -g npm
RUN npm --version

RUN npm install axios

COPY bot.js token ./

CMD node bot
