import * as fs from 'fs';
import { assert } from 'console';

import * as TelegramBot from 'node-telegram-bot-api'
import 'reflect-metadata'
import * as typeorm from 'typeorm'
import * as math from 'mathjs'

import { Group } from './entity/Group';
import './date'

const token = fs.readFileSync('token').toString().trim();
const botId = Number(token.split(':')[0]);
const bot = new TelegramBot(token, {polling: true});

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

function botLog(message?: any, ...optionalParams: any[]): void {
    console.log(new Date().toLocaleString(), message, optionalParams)
}

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
    botLog(`connected to database ${db.name}`);
    botLog('当前所在群聊：');
    (await Group.find()).forEach(group => botLog(`\t${group.id}`));
    const me = await bot.getMe();
    assert(me.id === botId, 'bot username 检查失败');
    {
        // setup commands & protect namespace
        const commandObjects = Object.entries(botCommands).map(([command, description]) => { return {command, description}; });
        assert(await bot.setMyCommands(commandObjects), '设置命令失败');
    }

    // 上一次各群组报时的日期及小时（包括群友报时）
    let lastReport: Record<number, string> = {};
    async function setupReport() {
        for (;;) {
            const timeout = new Date().getNextHourTimeout(1);
            botLog(`setup timeout:${timeout}ms`);
            await new Promise(resolve => setTimeout(resolve, timeout));
            const d = new Date();
            const hours12 = d.getHours() % 12;
            const cur = d.toLocaleDateHoursString();
            const groups = await Group.find();
            // 等待所有组都发完
            await Promise.all(groups.map(async group => {
                if (lastReport[group.id] === cur) {
                    botLog(`${d.toLocaleString()}：${group.id}群友已报时，跳过`);
                } else {
                    await bot.sendSticker(group.id, stickers[hours12]);
                    botLog(`${d.toLocaleString()}：成功向${group.id}报时`);
                }
            }));
            lastReport = {};
        }
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

        const mentionMe = entities.some(entity => {
            const entityText = text.slice(entity.offset, entity.offset + entity.length);
            return entity.type == 'mention' && entityText.slice(1) == me.username ||
                    entity.type == 'bot_command' && entityText.startsWith(`@${me.username}`) ||
                    entity.type == 'text_mention' && entity.user.username == me.username;
        });

        if (chat.type != 'private' && !mentionMe) return;
        entities.forEach(async entity => {
            const entityText = text.slice(entity.offset, entity.offset + entity.length);
            switch (entity.type) {
                case 'bot_command': {
                    let [cmd] = entityText.split('@');
                    botLog(`从聊天${chat.id}收到命令：${cmd}`);
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
                    break;
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
                botLog('收到私聊 sticker:', sticker);
                await bot.sendMessage(chat.id, sticker.file_id);
                await bot.sendSticker(chat.id, sticker.file_id);
                break;
            }
            case 'group': {
                const d = new Date();
                if (stickersInv[sticker.file_id] === d.getHours()) {
                    // 记录群友报时
                    lastReport[chat.id] = d.toLocaleDateHoursString();
                }
                break;
            }
        }
    });

    bot.on('new_chat_members', async msg => {
        if (msg.new_chat_members.find(member => member.id == botId)) {
            const chat = msg.chat;
            await new Group(chat.id).save();
            botLog(`加入${chat.title}(${chat.id})`);
            // await bot.sendMessage(chat.id, '我会报时啦！');
        }
    });
    
    bot.on('left_chat_member', async msg => {
        if (msg.left_chat_member.id == botId) {
            const chat = msg.chat;
            await new Group(chat.id).remove();
            botLog(`离开${chat.title}(${chat.id})`);
        }
    });
}).catch(error => botLog(error));
