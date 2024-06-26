import TelegramBot from 'node-telegram-bot-api';
import moment from 'moment';
import _ from 'lodash';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

let chatID: string | number = '@tintk_RSI_CCI'; //'@tintk_RSI_CCI'
let errorChatID: string | number = '@tintk_RSI_CCI'; //'@tintk_RSI_CCI'
const tinID: string | number = 1833284254;

export default class Telegram {
    private listMess: Array<string>;
    private timeoutMess: any;
    private listErr: Array<string>;
    private timeoutErr: any;
    private list: Array<Array<Array<number | string>>>;
    private timeout: any;
    private TAG: string;
    private bot: TelegramBot;


    constructor(tag?: string, token?: string, polling?: boolean) {
        let botToken: any = token || process.env.TELEGRAM_TOKEN;

        this.listMess = [];
        this.listErr = [];
        this.list = [];
        this.TAG = tag ? `${tag}\n` : '';
        this.bot = new TelegramBot(botToken, { polling: !!polling });
    }

    private encodeHTML(str: string) {
        return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    setChatID(id: string | number) {
        chatID = id;
        errorChatID = id;
    }

    sendMessage(mess: string, sendTin = false) {
        try {
            console.log(this.TAG, 'Send message telegram', mess);
            mess = this.encodeHTML(mess);
            this.listMess.push(mess);
            clearTimeout(this.timeoutMess);
            this.timeoutMess = setTimeout(() => {
                let s = this.TAG + this.listMess.join('\n\n\n');
                this.bot.sendMessage(sendTin ? tinID : chatID, s, { parse_mode: 'HTML' });
                this.listMess = [];
            }, 1000);
        }
        catch (err: any) {
            let logError = `${this.TAG}${moment().format('DD/MM/YYYY HH:mm:ss')} ____ ${err.message}`;
            console.log('sendTelegram ERROR', logError);
        }
    }
    sendError(mess: string) {
        try {
            console.log(this.TAG, 'Send error telegram', mess);
            mess = `❗️❗️❗️ Có lỗi ❗️❗️❗️\n<b>${mess}</b>`;
            this.listErr.push(mess);
            clearTimeout(this.timeoutErr);
            this.timeoutErr = setTimeout(() => {
                let s = this.TAG + this.listErr.join('\n\n\n');
                this.bot.sendMessage(errorChatID, s, { parse_mode: 'HTML' });
                this.listErr = [];
            }, 1000);
        }
        catch (err: any) {
            let logError = `${this.TAG}${moment().format('DD/MM/YYYY HH:mm:ss')} ____ ${err.message}`;
            console.log('sendTelegram ERROR', logError);
        }
    }
    sendTable(_data: Array<Array<number | string>>) {
        try {
            this.list.push(_data);
            clearTimeout(this.timeout);
            const sendTele = async () => {
                let mess = '';
                for (let data of this.list) {
                    let rows = data.length;
                    let cols = data[0].length;

                    let genarateString = (char: string, length: number) => {
                        let s = '';
                        for (let i = 0; i < length; i++) s += char;
                        return s;
                    }
                    for (let i = 0; i < cols; i++) {
                        let maxLength = 0;
                        for (let j = 0; j < rows; j++) {
                            maxLength = Math.max(maxLength, (data[j][i] + '').length);
                        }
                        for (let j = 0; j < rows; j++) {
                            data[j][i] += genarateString(' ', maxLength - (data[j][i] + '').length);
                        }
                    }

                    let table = data.map(item => `|${item.join('| ')}|`);
                    let tableToText = `\n${genarateString('-', table[0].length)}\n${table.map(item => `${item}\n${genarateString('-', item.length)}\n`).join('').trim()}\n`

                    mess += tableToText + '\n\n\n';
                    console.log(this.TAG, 'Send table telegram', tableToText);
                }
                this.list = [];
                mess = `\`\`\`\n${this.TAG}${mess}\n\`\`\``;
                await this.bot.sendMessage(chatID, mess, { parse_mode: 'Markdown' });
            }
            if (this.list.length >= 3) sendTele();
            else this.timeout = setTimeout(sendTele, 1000)
        }
        catch (err: any) {
            let logError = `${this.TAG}${moment().format('DD/MM/YYYY HH:mm:ss')} ____ ${err.message}`;
            console.log('sendTelegram ERROR', logError);
        }
    }
    async sendPhoto(path: string, caption = '') {
        try {
            console.log(this.TAG, 'Send photo telegram');
            await this.bot.sendPhoto(chatID, path, { caption });
        }
        catch (err: any) {
            let logError = `${this.TAG}${moment().format('DD/MM/YYYY HH:mm:ss')} ____ ${err.message} `;
            console.log('sendPhotoTelegram ERROR', logError);
        }
    }
};