import { strict as assert } from 'assert'

import * as TelegramBot from 'node-telegram-bot-api'
import {Entity, BaseEntity, PrimaryColumn, Column} from "typeorm";
import { chatIsGroup } from '../aug';

@Entity()
export class Group extends BaseEntity {
    @PrimaryColumn()
    id: number;
    @Column()
    title: string;
    @Column()
    on: boolean

    constructor(id: number = null, title: string = null) {
        super();
        this.id = id;
        this.title = title;
        this.on = true;
    }

    static fromChat(chat: TelegramBot.Chat): Group {
        assert(chatIsGroup(chat));
        return new Group(chat.id, chat.title);
    }

    /**
     * 获取群聊可读名称
     * @returns 群聊可读名称
     */
    name(): string { return `${this.title}\(${this.id}\)`; }

    async setOn(on: boolean) {
        this.on = on;
        await this.save();
    }

    /**
     * 获取当前数据库摘要
     * @param take 最多选多少个样本
     * @returns 摘要字符串
     */
    static async digest(take: number = -1) {
        const groups = await Group.find({take});
        return '当前所在群聊：\n' + groups.map(group => `${group.id}  ${group.title} ${group.on}`).join('\n') + '\n';
    }
}
