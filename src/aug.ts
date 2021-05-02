import * as TelegramBot from 'node-telegram-bot-api';

declare global {
    interface Date {
        /**
         * 转为日期+小时的字符串，按照当前 locale 格式
         */
        toLocaleDateHoursString(): string;
        
        /**
         * 获取到下一小时的毫秒数
         * @param minutes 延迟分钟数
         * @param seconds 延迟秒数
         */
        getNextHourTimeout(minutes?: number, seconds?: number): number;
    }
}

Date.prototype.toLocaleDateHoursString = function(this: Date): string {
    return String([this.toLocaleDateString(), this.getHours()]);
}

Date.prototype.getNextHourTimeout = function(this: Date, minutes = 0, seconds = 0): number {
    return ((59 - this.getMinutes() + minutes) * 60 + 59 - this.getSeconds() + seconds) * 1000 + 1000 - this.getMilliseconds();
}

// It's insane ts does not allow default interface default implementation
// ts 为啥不让 interface 有默认实现？？？
export function chatIsGroup(chat: TelegramBot.Chat): boolean {
    return (<TelegramBot.ChatType[]>['group', 'supergroup']).includes(chat.type);
}