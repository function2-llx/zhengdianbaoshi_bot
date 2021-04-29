FROM node:14
EXPOSE 9140

WORKDIR /app

COPY src ./
COPY ormconfig.json ./
COPY package.json ./
COPY tsconfig.json ./
COPY token ./

RUN npm install

CMD npm start
