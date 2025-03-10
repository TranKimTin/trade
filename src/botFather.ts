import Telegram from './common/telegram';
import io from 'socket.io-client';
import { StaticPool } from 'node-worker-threads-pool';
import dotenv from 'dotenv';

dotenv.config({ path: `${__dirname}/../.env` });


export class BotFather {
    private telegram: Telegram;
    private hostWebServer: string;
    private workerList;

    constructor() {
        this.telegram = new Telegram(undefined, undefined, true);
        this.hostWebServer = process.env.HOST_WEB_SERVER || 'http://localhost';

        const brokers = ['binance_future', 'binance', 'bybit', 'bybit_future', 'okx'];
        this.workerList = [];
        for (const broker of brokers) {
            const worker = new StaticPool({ size: 1, task: './worker_socket.js' });
            worker.exec({ type: 'init', value: broker });
            this.workerList.push(worker);
        }

        this.connectToWebConfig(8080);
    }

    private async updateWorker() {
        for (let item of this.workerList) {
            const runtime = await item.exec({ type: 'update' });
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
