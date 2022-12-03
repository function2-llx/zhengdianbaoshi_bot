import * as fs from 'fs';
import { strict as assert } from 'assert'

import * as winston from 'winston'
import * as TelegramBot from 'node-telegram-bot-api'
import 'reflect-metadata'
import * as typeorm from 'typeorm'
import * as math from 'mathjs'
import 'luxon'
import { DateTime } from 'luxon'

import { Group } from './entity/Group';
import { chatIsGroup } from './aug'

const token = fs.readFileSync('token').toString().trim();
const botId = Number(token.split(':')[0]);
const bot = new TelegramBot(token, {polling: true});

const botCommands = {
    'fudu': '复读命令后方的文字',
    'sanmei': '随机生成一只丑三妹',
    'baoshi': '手动报时',
    'time': '获取服务器时间',
    'on': '开启整点报时功能',
    'off': '关闭整点报时功能',
} as const;
const csm = [
    '“今天的活动可以抽酸梅汤。”\n“丑三妹？在哪儿呢丑三妹？”',
    '“我只是想耍一哈。”“我也没得怪你的意思。”',
    '不过还是多次切片的写法帅一点（可惜编译不通过',
] as const;

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: () => DateTime.now().toISO() }),
        winston.format.printf(({level, message, timestamp}) => `${timestamp} ${level}: ${message}`),
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'bot.log' })
    ]
});

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

const ds = new typeorm.DataSource({
    'type': 'sqlite',
    'database': 'database.sqlite',
    'synchronize': true,
    'logging': false,
    'entities': [Group],
});

ds.initialize().then(async () => {
    logger.info(`连接到数据库：${ds.name}`);
    logger.info(await Group.digest());
    
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
            const timeout = DateTime.now().getNextHourTimeout(1);
            logger.info(`setup timeout:${timeout}ms`);
            await new Promise(resolve => setTimeout(resolve, timeout));
            const d = DateTime.now();
            const hours12 = d.hour % 12;
            const cur = d.toLocaleDateHoursString();
            const groups = await Group.find({
                select: ['id', 'title'],
                where: { on: true },
            });
            // 等待所有组都发完
            await Promise.all(groups.map(async group => {
                if (lastReport[group.id] === cur) {
                    logger.info(`${d.toLocaleString()}：${group.name()}群友已报时，跳过`);
                } else {
                    bot.sendSticker(group.id, stickers[hours12])
                        .then(() => logger.info(`${d.toLocaleString()}：成功向${group.name()}报时`))
                        .catch(async (err: Error) => {
                            if (err.message == 'ETELEGRAM: 403 Forbidden: bot was kicked from the group chat') {
                                logger.info(`检测到 ${group.name()} 可能已不存在`);
                                await group.remove();
                            } else {
                                logger.info(`${d.toLocaleString()}：未成功向${group.name()}报时，原因不详`);
                                logger.error(JSON.stringify(err));
                            }
                        });
                }
            }));
            lastReport = {};
        }
    }
    setupReport();
    
    bot.on('text', async msg => {
        const {chat, text, entities} = msg;
        if (entities === undefined) return;
        const mentionMe = entities.some(entity => {
            const entityText = text.slice(entity.offset, entity.offset + entity.length);
            return entity.type == 'mention' && entityText.slice(1) == me.username ||
                    entity.type == 'bot_command' && entityText.includes(`@${me.username}`) ||
                    entity.type == 'text_mention' && entity.user.username == me.username;
        });
    
        if (chat.type != 'private' && !mentionMe) return;
        entities.forEach(async entity => {
            const entityText = text.slice(entity.offset, entity.offset + entity.length);
            switch (entity.type) {
                case 'bot_command': {
                    const cmd = entityText.split('@')[0].slice(1) as keyof typeof botCommands;
                    logger.info(`从聊天${chat.id}收到命令：${cmd}`);
                    switch (cmd) {
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
                            const d = DateTime.now();
                            await bot.sendSticker(chat.id, stickers[d.hour % 12]);
                            lastReport[chat.id] = d.toLocaleDateHoursString();
                            break;
                        }
                        case 'time': {
                            // bot 所处服务器 locale 设为 zh_CN.utf8
                            await bot.sendMessage(chat.id, DateTime.now().toLocaleString(DateTime.DATETIME_HUGE_WITH_SECONDS));
                            break;
                        }
                        case 'off':
                        case 'on': {
                            if (chatIsGroup(chat)) {
                                const group = Group.fromChat(chat);
                                const on = cmd == 'on';
                                await group.setOn(on);
                                await bot.sendMessage(chat.id, `已${on ? '打开' : '关闭'}本群组的报时`);
                            } else {
                                await bot.sendMessage(chat.id, '本命令只对群组有效');
                            }
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
                logger.info('收到私聊 sticker:', sticker);
                await bot.sendMessage(chat.id, sticker.file_id);
                await bot.sendSticker(chat.id, sticker.file_id);
                break;
            }
            case 'group': {
                const d = DateTime.now();
                if (stickersInv[sticker.file_id] === d.hour) {
                    // 记录群友报时
                    lastReport[chat.id] = d.toLocaleDateHoursString();
                }
                break;
            }
        }
    });
    
    bot.on('new_chat_members', async msg => {
        if (msg.new_chat_members.find(member => member.id == botId)) {
            const group = Group.fromChat(msg.chat);
            await group.save();
            logger.info(`加入${group.name()}`);
        }
    });
    
    bot.on('left_chat_member', async msg => {
        if (msg.left_chat_member.id == botId) {
            const group = Group.fromChat(msg.chat);
            // group.remove 后 id 会清空
            const name = group.name();
            await group.remove();
            logger.info(`离开${name}`);
        }
    });
    
    bot.on('group_chat_created', async msg => {
        const group = Group.fromChat(msg.chat);
        logger.info(`群组创建：` + group.name());
        await group.save();
    });
    
    
    bot.on('new_chat_title', async msg => {
        const group = Group.fromChat(msg.chat);
        logger.info(`群组更名：` + group.name());
        await group.save();
    })
    
    bot.on('polling_error', err => {
        // 测试用
        console.log(err.name);
        console.log(err.message);
        err.name
    })
});
