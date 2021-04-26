import "reflect-metadata";
import * as typeorm from "typeorm";
import * as fs from "fs";
import TelegramBot = require('node-telegram-bot-api');
import {Group} from "./entity/Group";

const token = fs.readFileSync('token').toString().trim();
const botId = Number(token.split(':')[0]);
const bot = new TelegramBot(token, {polling: true});

function getHour() {
    let date = new Date();
    //              origin time zone -> UTC                     -> Beijing(UTC+8)
    date.setMinutes(date.getMinutes() + date.getTimezoneOffset() + 8 * 60);
}

bot.onText(/\/复读 (.+)/, (msg, match) => {
    console.log(msg);
    const chatId = msg.chat.id;
    const text = match[1];
    bot.sendMessage(chatId, `收到啦！你刚刚对我说：${text}`);
});
// typeorm.createConnection().then(async db => {
//     console.log(`connected to database ${db.name}`);

//     // bot.on('new_chat_members', async msg => {
//     //     console.log(msg);
//     //     if (msg.new_chat_members.find(member => member.id == botId)) {
//     //         const chat = msg.chat;
//     //         new Group({id: chat.id}).save();
//     //         console.log(`加入${chat.title}(${chat.id})`);
//     //         bot.sendMessage(chat.id, '我还在开发中，还不会报时呜呜呜 T T');
//     //     }
//     // });
    
//     // bot.on('left_chat_member', async msg => {
//     //     if (msg.left_chat_member.id == botId) {
//     //         const chat = msg.chat;
//     //         console.log(`离开${chat.title}(${chat.id})`);
//     //         new Group({id: chat.id}).save();
//     //     }
//     // });
// }).catch(error => console.log(error));
