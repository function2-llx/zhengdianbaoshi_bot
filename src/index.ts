import * as fs from 'fs';
import { assert } from 'console';

import * as TelegramBot from 'node-telegram-bot-api'
import 'reflect-metadata'
import * as typeorm from 'typeorm'
import * as math from 'mathjs'

import { Group } from './entity/Group';

const token = fs.readFileSync('token').toString().trim();
const botId = Number(token.split(':')[0]);
const bot = new TelegramBot(token, {polling: true});
// const timezone = 8;

// function getTimezoneTime(): {hours: number, minutes: number, seconds: number} {
//     let date = new Date();
//     //              time zone of server ->          UTC         -> Beijing(UTC+8)
//     date.setMinutes(date.getMinutes() + date.getTimezoneOffset() + timezone * 60);
//     return {
//         hours: date.getHours(),
//         minutes: date.getMinutes(),
//         seconds: date.getSeconds(),
//     }
// }

const botCommands = {
    'fudu': '复读命令后方的文字',
    'sanmei': '随机生成一只丑三妹',
    'baoshi': '手动报时',
    'time': '获取服务器时间',
    'on': '开启整点点报时功能',
    'off': '关闭整点报时功能',
} as const;
const csm = [
    '“今天的活动可以抽酸梅汤。”\n“丑三妹？在哪儿呢丑三妹？”',
    '“我只是想耍一哈。”“我也没得怪你的意思。”',
    '不过还是多次切片的写法帅一点（可惜编译不通过',
] as const;

// 来自 https://t.me/addstickers/what_what_time_is_it
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
] as const;
const stickersInv = stickers.reduce((result, sticker, idx) => (result[sticker] = idx, result), {} as Record<string, number>);

typeorm.createConnection().then(async db => {
    console.log(`connected to database ${db.name}`);
    const me = await bot.getMe();
    assert(me.id === botId, 'bot username 检查失败');
    assert(await bot.setMyCommands(Object.entries(botCommands).map(([command, description]) => {
        return {command, description};
    })), '设置命令失败');

    // 上一次报时的日期及小时（包括群友报时）
    let lastReport: string;

    async function setupReport() {
        const d = new Date();
        // 给群友一分钟时间报时
        const memberMinutes = 1;
        // 对齐整小时
        const timeout = ((59 + memberMinutes - d.getMinutes()) * 60 + 60 - d.getSeconds()) * 1000 + 1000 - d.getMilliseconds();
        await new Promise(resolve => setTimeout(resolve, timeout));
        // 每小时报时一次
        setInterval(async () => {
            const d = new Date();
            // 群友已经报过时了
            if (d.toLocaleDateHoursString() === lastReport) return;
            (await Group.find()).forEach(group => bot.sendSticker(group.id, stickers[d.getHours() % 12]));
        }, 60 * 60 * 1000);
    }

    setupReport();

    bot.on('text', async msg => {
        if (msg.entities === undefined) return;
        const {chat, text, entities} = msg;
        // function groupEntities(entities: TelegramBot.MessageEntity[]) {
        //     const groupedEntities = {} as Record<TelegramBot.MessageEntityType, TelegramBot.MessageEntity[]>;
        //     const meta = reflect<TelegramBot.MessageEntityType>() as UnionType;
        //     assert(meta.kind == TypeKind.Union);
        //     meta.types.forEach((type: StringLiteralType) => {
        //         assert(type.kind == TypeKind.StringLiteral);
        //         groupedEntities[type.value as TelegramBot.MessageEntityType] = [];
        //     });
        //     entities.forEach(entity => groupedEntities[entity.type].push(entity));
        //     return groupedEntities;
        // }
        // const groupedEntities = groupEntities(entities);

        function getEntityText(entity: TelegramBot.MessageEntity) {
            return text.slice(entity.offset, entity.offset + entity.length);
        }

        const mentionMe = entities.some(entity => {
            const text = getEntityText(entity);
            return entity.type == 'mention' && text.slice(1) == me.username ||
                    entity.type == 'bot_command' && text.startsWith(`@${me.username}`) ||
                    entity.type == 'text_mention' && entity.user.username == me.username;
        });

        if (chat.type != 'private' && !mentionMe) return;
        entities.forEach(async entity => {
            const text = getEntityText(entity);
            switch (entity.type) {
                case 'bot_command': {
                    let [cmd] = text.split('@');
                    console.log(`从聊天${chat.id}收到命令：${text}`);
                    cmd = cmd.slice(1);
                    switch (cmd as keyof typeof botCommands) {
                        case 'fudu': {
                            const fuduText = text.slice(entity.offset + entity.length);
                            if (fuduText.length > 0) {
                                await bot.sendMessage(chat.id, fuduText);
                            }
                            break;
                        }
                        case 'sanmei': {
                            await bot.sendMessage(chat.id, csm[math.randomInt(0, csm.length)]);
                            break;
                        }
                        case 'baoshi': {
                            await bot.sendSticker(chat.id, stickers[new Date().getHours() % 12]);
                            break;
                        }
                        case 'time': {
                            // bot 所处服务器 locale 设为 zh_CN.utf8
                            await bot.sendMessage(chat.id, new Date().toLocaleString());
                            break;
                        }
                        default: {
                            // 未知指令
                            break;
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
        switch (chat.type) {
            case 'private': {
                // 用来手动获取 sticker id
                console.log('收到私聊 sticker:', sticker);
                await bot.sendMessage(chat.id, sticker.file_id);
                await bot.sendSticker(chat.id, sticker.file_id);
                break;
            }
            case 'group': {
                const d = new Date();
                if (stickersInv[sticker.file_id] === d.getHours()) {
                    lastReport = d.toLocaleDateHoursString();
                }
                break;
            }
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
