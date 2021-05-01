export {};

declare global {
    interface Date {
        toLocaleDateHoursString(): string;
    }
}

Date.prototype.toLocaleDateHoursString = function(this: Date): string {
    return String([this.toLocaleDateString(), this.getHours()]);
}
