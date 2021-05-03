import * as TelegramBot from 'node-telegram-bot-api';
// workaround for https://github.com/microsoft/TypeScript/issues/18877
import { DateTime } from 'luxon/src/datetime'

declare module 'luxon/src/datetime' {
    interface DateTime {
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

DateTime.prototype.toLocaleDateHoursString = function (this: DateTime): string {
    return String([this.toLocaleString(DateTime.DATE_SHORT), this.hour]);
}

DateTime.prototype.getNextHourTimeout = function(this: DateTime, minutes = 0, seconds = 0): number {
    return ((59 - this.minute + minutes) * 60 + 59 - this.second + seconds) * 1000 + 1000 - this.millisecond;
}

// It's insane ts does not allow default interface default implementation
// ts 为啥不让 interface 有默认实现？？？
export function chatIsGroup(chat: TelegramBot.Chat): boolean {
    return (<TelegramBot.ChatType[]>['group', 'supergroup']).includes(chat.type);
}
