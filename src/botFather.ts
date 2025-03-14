import Telegram from './common/telegram';
import io from 'socket.io-client';
import { StaticPool } from 'node-worker-threads-pool';
import * as mysql from './WebConfig/lib/mysql';
import dotenv from 'dotenv';
import { BotInfo } from './common/Interface';

dotenv.config({ path: `${__dirname}/../.env` });


export class BotFather {
    private telegram: Telegram;
    private hostWebServer: string;
    private workerList: Array<StaticPool<any, any>>;

    constructor() {
        this.telegram = new Telegram(undefined, undefined, true);
        this.hostWebServer = process.env.HOST_WEB_SERVER || 'http://localhost';

        const brokers = ['binance_future', 'binance', 'bybit', 'bybit_future', 'okx'];
        this.workerList = [];
        for (const broker of brokers) {
            this.initWorker(broker);
        }

        this.connectToWebConfig(8080);
    }

    private async initWorker(broker: string) {
        const worker = new StaticPool({ size: 1, task: './worker_socket.js' });
        this.workerList.push(worker);
        await worker.exec({ type: 'init', value: broker });
    }

    private async updateWorker() {
        const botList: Array<any> = await mysql.query(`SELECT id, botName, idTelegram, route, symbolList, timeframes, treeData FROM Bot`);
        const botChildren = [];
        const botIDs: { [key: string]: number } = {};

        for (const bot of botList) {
            const botInfo: BotInfo = {
                botName: bot.botName,
                idTelegram: bot.idTelegram,
                route: JSON.parse(bot.route),
                symbolList: JSON.parse(bot.symbolList),
                timeframes: JSON.parse(bot.timeframes),
                treeData: JSON.parse(bot.treeData)
            };
            botInfo.symbolList.sort();
            botChildren.push(botInfo);
            botIDs[bot.botName] = bot.id;
        }

        const symbolListener: { [key: string]: boolean } = {};

        for (const bot of botChildren) {
            for (const timeframe of bot.timeframes) {
                for (const s of bot.symbolList) {
                    const [broker, symbol] = s.split(':');
                    const key = `${broker}_${symbol}_${timeframe}`;
                    symbolListener[key] = true;
                }
            }
        }

        console.log('init bot list', botChildren.length);

        for (const worker of this.workerList) {
            const runtime = await worker.exec({ type: 'update', value: { symbolListener, botChildren, botIDs } });
            console.log(`update worker runtime = ${runtime} ms`);
        }
    }

    private connectToWebConfig(port: number) {
        const client = io(`${this.hostWebServer}:${port}`, {
            reconnection: true,              // Bật tính năng tự động kết nối lại (mặc định là true)
            reconnectionAttempts: Infinity,  // Số lần thử kết nối lại tối đa (mặc định là vô hạn)
            reconnectionDelay: 1000,         // Thời gian chờ ban đầu trước khi thử kết nối lại (ms)
            reconnectionDelayMax: 5000,      // Thời gian chờ tối đa giữa các lần thử kết nối lại (ms)
            randomizationFactor: 0.5,         // Yếu tố ngẫu nhiên trong thời gian chờ kết nối lại,
            transports: ['websocket', 'polling']
        });

        client.on('connect', () => {
            console.log(`Connected to web config :${port}`);
            this.updateWorker();
        });

        client.on('onUpdateConfig', (botName: string) => {
            console.log('onUpdateConfig', botName);
            this.updateWorker();
        });

        client.on('disconnect', (reason: string) => {
            console.log(`onDisconnect - Disconnected from web config :${port}. reason: ${reason}`);
        });

        client.on("connect_error", (error: { message: any; }) => {
            console.error(`connect_error - Attempting to reconnect web config :${port}`, error.message);
            if (client.active) {
            } else {
                client.connect();
            }
        });
    }

    public async init() {
        console.log('BotFather init');
    }
};

const botFather = new BotFather();
botFather.init();
