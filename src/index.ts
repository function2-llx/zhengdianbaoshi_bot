import 'reflect-metadata'
import * as typeorm from 'typeorm'
import * as fs from 'fs';
import TelegramBot = require('node-telegram-bot-api');
import {Group} from './entity/Group';
import { assert } from 'console';
import * as math from 'mathjs'

const token = fs.readFileSync('token').toString().trim();
const botId = Number(token.split(':')[0]);
const bot = new TelegramBot(token, {polling: true});

function getTime(): [number, number] {
    let date = new Date();
    //              origin time zone -> UTC                     -> Beijing(UTC+8)
    date.setMinutes(date.getMinutes() + date.getTimezoneOffset() + 8 * 60);
    return [date.getHours(), date.getMinutes()];
}

const botCommands = {
    'fudu': '复读命令后方的文字',
    'sanmei': '随机生成一只丑三妹',
    'baoshi': '手动报时'
} as const;
const csm = [
    '“今天的活动可以抽酸梅汤。”\n“丑三妹？在哪儿呢丑三妹？”',
    '“我只是想耍一哈。”“我也没得怪你的意思。”',
    '不过还是多次切片的写法帅一点（可惜编译不通过',
] as const;

const stickers = [
    'CAACAgUAAxkBAAONYIcMo6PL8b9BwGGsPwO58AgojIUAAvMAAw8VzRnmFuRA7k_-mh8E',
    'CAACAgUAAxkBAAOQYIcMxiEXboofKOvQE6YOLRIsGkYAAvQAAw8VzRnCSt6s5LPKix8E',
    'CAACAgUAAxkBAAOTYIcM0cpGo3-C6nVu--PvG_a22dMAAvUAAw8VzRmelJ4s9iMhdx8E',
    'CAACAgUAAxkBAAOWYIcM3CIzWmXmHhAwklQo0Vpx4QUAAvYAAw8VzRkS6fdy-_4Eix8E',
    'CAACAgUAAxkBAAOZYIcM6NvXvN0erWk44z43PmeBmZkAAvcAAw8VzRkVPasEfCdjYx8E',
    'CAACAgUAAxkBAAOcYIcM8iWrWUpftSil3QABK3124ry1AAL4AAMPFc0ZhBChqssLLJ4fBA',
    'CAACAgUAAxkBAAOfYIcNDEauSAh4fFq6xK2Jw1KKPdAAAvkAAw8VzRnuTOqtxTiLPx8E',
    'CAACAgUAAxkBAAOiYIcNGIkZJZ7L7qzFueCXIKMS_DgAAvoAAw8VzRmJSexWTOjOKx8E',
    'CAACAgUAAxkBAAOlYIcNIU5Ef7hW2rwCkJCFGTG97LoAAvsAAw8VzRnvGqsRLvTgix8E',
    'CAACAgUAAxkBAAOoYIcNKw0Ox7EtSIUi7l356CUpIdMAAvwAAw8VzRkm-OCOhTflMx8E',
    'CAACAgUAAxkBAAOrYIcNNsmtkTVgcPYiidKqprkQEqcAAv0AAw8VzRmBmFdew1wW5B8E',
    'CAACAgUAAxkBAAOuYIcNP5HfhXidL6udsh4Da2id1nIAAv4AAw8VzRlro_2eqbBjeB8E',
]

typeorm.createConnection().then(async db => {
    console.log(`connected to database ${db.name}`);
    const me = await bot.getMe();
    assert(me.username === 'zhengdianbaoshi_bot', 'bot username 检查失败');
    assert(await bot.setMyCommands(Object.entries(botCommands).map(([command, description]) => {
        return {command, description};
    })), '设置命令失败');

    bot.on('text', async msg => {
        if (msg.entities === undefined) return;
        // const text = msg.text;
        let {chat, text} = msg;
        msg.entities.forEach(async entity => {
            const entity_text = text.slice(entity.offset, entity.offset + entity.length);
            switch (entity.type) {
                case 'bot_command': {
                    console.log(`从聊天${chat.id}收到命令：${entity_text}`);
                    let [cmd, username] = entity_text.split('@');
                    if (username === me.username || chat.type == 'private') {
                        cmd = cmd.slice(1);
                        switch (cmd as keyof typeof botCommands) {
                            case 'fudu': {
                                const fudu_text = text.slice(entity.offset + entity.length);
                                if (fudu_text.length > 0) {
                                    await bot.sendMessage(chat.id, fudu_text);
                                }
                                break;
                            }
                            case 'sanmei': {
                                await bot.sendMessage(chat.id, csm[math.randomInt(0, csm.length)]);
                                break;
                            }
                            case 'baoshi': {
                                let [hour] = getTime();
                                await bot.sendSticker(chat.id, stickers[hour % 12]);
                            }
                            default: {
                                // 未知指令
                                break;
                            }
                        }
                    }
                }
                default: {
                    break;
                }
            }
        });
    });

    bot.on('sticker', async msg => {
        const {chat, sticker} = msg;
        if (chat.type == 'private') {
            console.log('收到私聊 sticker:', sticker);
            await bot.sendMessage(chat.id, sticker.file_id);
            await bot.sendSticker(chat.id, sticker.file_id);
        }
    });

    bot.on('new_chat_members', async msg => {
        if (msg.new_chat_members.find(member => member.id == botId)) {
            const chat = msg.chat;
            new Group(chat.id).save();
            console.log(`加入${chat.title}(${chat.id})`);
            await bot.sendMessage(chat.id, '我还在开发中，还不会自动报时呜呜呜 T T');
        }
    });
    
    bot.on('left_chat_member', async msg => {
        if (msg.left_chat_member.id == botId) {
            const chat = msg.chat;
            console.log(`离开${chat.title}(${chat.id})`);
            new Group(chat.id).save();
        }
    });
}).catch(error => console.log(error));
