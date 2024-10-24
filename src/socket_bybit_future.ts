import { RateData } from "./BinanceFuture";
import * as util from './util';
import moment from 'moment';
import delay from 'delay';
import WebSocket from 'ws';
import ReconnectingWebSocket from 'reconnecting-websocket';

interface BybitCandle {
    start: number,
    end: number,
    interval: string,
    open: string,
    close: string,
    high: string,
    low: string,
    volume: string,
    turnover: string,
    confirm: boolean,
    timestamp: number
};

export class BybitSocketFuture {
    public static readonly broker = 'bybit_future'

    private gData: { [key: string]: { [key: string]: Array<RateData> } };
    private gLastPrice: { [key: string]: number };
    private gLastUpdated: { [key: string]: number };

    constructor() {
        this.gData = {};
        this.gLastPrice = {};
        this.gLastUpdated = {};
    }

    async init(numbler_candle_load: number, onCloseCandle: (broker: string, symbol: string, timeframe: string, data: Array<RateData>) => void) {
        const symbolList = await util.getBybitFutureSymbolList();
        // console.log(symbolList.join(' '));
        console.log(`${BybitSocketFuture.broker}: Total ${symbolList.length} symbols`);

        const timeframes = ['1m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '3m', '5m'];
        // timeframes = ['1m', '15m', '4h', '1d'];
        for (const symbol of symbolList) {
            this.gData[symbol] = {};
            for (const tf of timeframes) {
                this.gData[symbol][tf] = [];
            }
        }

        const rws = new ReconnectingWebSocket('wss://stream.bybit.com/v5/public/linear', [], { WebSocket: WebSocket });

        rws.addEventListener('open', () => {
            console.log(`${BybitSocketFuture.broker}: WebSocket connection opened`);

            for (let i = 0; i < symbolList.length; i += 10) {
                rws.send(JSON.stringify({
                    op: 'subscribe',
                    args: symbolList.slice(i, i + 10).map(item => `kline.1.${item}`)
                }));
                // await delay(50);
            }

        });

        const fetchCandles = (symbol: string, candle: BybitCandle) => {
            this.gLastUpdated[symbol] = new Date().getTime();
            for (const tf of timeframes) {
                const data: RateData = {
                    symbol: symbol,
                    startTime: util.getStartTime(tf, candle.start),
                    timestring: moment(util.getStartTime(tf, candle.start)).format('YYYY-MM-DD HH:mm:SS'),
                    open: +candle.open,
                    high: +candle.high,
                    low: +candle.low,
                    close: +candle.close,
                    volume: +candle.volume,
                    interval: tf,
                    isFinal: candle.confirm && util.checkFinal(tf, candle.start),
                    change: (+candle.close - +candle.open) / +candle.open,
                    ampl: (+candle.high - +candle.low) / +candle.open
                };
                this.gLastPrice[data.symbol] = data.close;

                const dataList = this.gData[data.symbol][data.interval];
                if (!dataList[0]) return;

                if (dataList[0].startTime == data.startTime) {
                    // dataList[0] = data;
                    dataList[0].high = Math.max(dataList[0].high, data.high);
                    dataList[0].low = Math.min(dataList[0].low, data.low);
                    dataList[0].close = data.close;
                    dataList[0].volume += candle.confirm ? data.volume : 0;
                    dataList[0].change = (dataList[0].close - dataList[0].open) / dataList[0].open;
                    dataList[0].ampl = (dataList[0].high - dataList[0].low) / dataList[0].open;

                    if (data.isFinal && !dataList[0].isFinal) {
                        dataList[0].isFinal = data.isFinal;
                        onCloseCandle(BybitSocketFuture.broker, data.symbol, data.interval, [...dataList]);
                    }
                }
                else if (dataList[0].startTime < data.startTime) {
                    dataList.unshift(data);
                    if (dataList.length > numbler_candle_load) {
                        dataList.pop();
                    }
                    if (dataList[1] && !dataList[1].isFinal) {
                        dataList[1].isFinal = true;
                        onCloseCandle(BybitSocketFuture.broker, data.symbol, data.interval, dataList.slice(1));
                    }
                }
            }
        }

        // ws.on('message', function incoming(mess) {
        rws.addEventListener('message', (event) => {
            const mess = event.data;
            const data: { type: string, topic: string, data: Array<BybitCandle> } = JSON.parse(mess.toString());
            if (!data || data.type !== 'snapshot') return;
            const symbol = data.topic.split('.')[2];

            for (const candle of data.data) {
                fetchCandles(symbol, candle);
            }
        });

        rws.addEventListener('close', (event) => {
            console.error(`${BybitSocketFuture.broker}: WebSocket connection closed ${event.code} ${event.reason}`);
            setTimeout(() => {
                throw `${BybitSocketFuture.broker}: WebSocket connection closed ${event.code} ${event.reason}`;
            }, 5000);
        });

        rws.addEventListener('error', (err) => {
            ``
            console.error(`${BybitSocketFuture.broker}: WebSocket error: `, err);
            setTimeout(() => {
                throw err;
            }, 5000);
        });


        const initCandle = async (symbol: string, tf: string) => {
            const rates = await util.getBybitFutureOHLCV(symbol, tf, numbler_candle_load);
            this.gData[symbol][tf] = rates;
            this.gLastPrice[symbol] = this.gData[symbol][tf][0]?.close || 0;
            // console.log('init candle', { symbol, tf })
        }

        for (const tf of timeframes) {
            console.log(`${BybitSocketFuture.broker}: init candle ${tf}...`);
            let promiseList = [];
            for (const symbol of symbolList) {
                promiseList.push(initCandle(symbol, tf));
                if (promiseList.length >= 100) {
                    await Promise.all(promiseList);
                    promiseList = [];
                    await delay(5000);
                }
            }
            await Promise.all(promiseList);

            await delay(1000);
        }

        const timeInterval = 10 * 60 * 1000;
        setInterval(() => {
            const now = new Date().getTime();
            for (const symbol in this.gLastUpdated) {
                const lastTimeUpdated = this.gLastUpdated[symbol];
                if (now - lastTimeUpdated > timeInterval) {
                    console.error(`${BybitSocketFuture.broker}: ${symbol} not uppdated. [${new Date(lastTimeUpdated)}, ${new Date(now)}]`);
                    throw `${BybitSocketFuture.broker}: ${symbol} not uppdated. [${new Date(lastTimeUpdated)}, ${new Date(now)}]`;
                }
            }
        }, timeInterval);
    }
};


import http from 'http';
import { Server } from "socket.io";
import { SymbolListener } from "./botFather";
const server = http.createServer();
const io = new Server(server, {
    pingInterval: 25000,
    pingTimeout: 60000
});
const port = 84;
let cnt = 0;
let symbolListener: { [key: string]: boolean } = {};

io.on('connection', client => {
    cnt++;
    console.log(`${BybitSocketFuture.broker}: client connected. total: ${cnt} connection`);

    client.on('disconnect', () => {
        cnt--;
        console.log(`${BybitSocketFuture.broker}: onDisconnect - Client disconnected. total: ${cnt} connection`);
    });

    client.on('update_symbol_listener', (data: Array<SymbolListener>) => {
        console.log(`${BybitSocketFuture.broker} on update_symbol_listener`);
        console.log(JSON.stringify(data));
        symbolListener = {};
        for (const { symbol, timeframe, broker } of data) {
            if (broker !== BybitSocketFuture.broker) continue;
            let key = `${symbol}:${timeframe}`;
            symbolListener[key] = true;
        }
    });
});
server.listen(port);

function onCloseCandle(broker: string, symbol: string, timeframe: string, data: Array<RateData>) {
    let key = `${symbol}:${timeframe}`;
    if (!symbolListener[key]) return;

    io.emit('onCloseCandle', { broker, symbol, timeframe, data });
}

const bybitSocketFuture = new BybitSocketFuture();
bybitSocketFuture.init(300, onCloseCandle);