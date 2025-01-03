import IBinance, { Binance, Candle } from 'binance-api-node';
import * as util from './common/util';
import moment from 'moment';
import delay from 'delay';
import WebSocket from 'ws';
import ReconnectingWebSocket from 'reconnecting-websocket';

export class BinanceSocket {
    public static readonly broker = 'binance';

    private gBinance: Binance;
    private gData: { [key: string]: { [key: string]: Array<RateData> } };
    private gLastPrice: { [key: string]: number };
    private gLastUpdated: { [key: string]: number };

    constructor() {
        this.gBinance = IBinance({});
        this.gData = {};
        this.gLastPrice = {};
        this.gLastUpdated = {};
    }

    public async init(numbler_candle_load: number, onCloseCandle: (broker: string, symbol: string, timeframe: string, data: Array<RateData>) => void) {
        const symbolList = await util.getBinanceSymbolList();
        // console.log(symbolList.join(' '));
        console.log(`${BinanceSocket.broker}: Total ${symbolList.length} symbols`);

        const timeframes = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d'];
        // timeframes = ['1m', '15m', '4h', '1d'];
        for (const symbol of symbolList) {
            this.gData[symbol] = {};
            this.gLastUpdated[symbol] = new Date().getTime();
            for (const tf of timeframes) {
                this.gData[symbol][tf] = [];
            }
        }

        const mergeData = (data: RateData, isFinalMinute: boolean) => {
            this.gLastPrice[data.symbol] = data.close;

            const dataList = this.gData[data.symbol][data.interval];
            if (dataList.length === 0) {
                dataList.push(data);
                return
            };

            if (dataList[0].startTime == data.startTime) {
                // dataList[0] = data;
                dataList[0].high = Math.max(dataList[0].high, data.high);
                dataList[0].low = Math.min(dataList[0].low, data.low);
                dataList[0].close = data.close;
                dataList[0].volume += isFinalMinute ? data.volume : 0;

                if (data.isFinal && !dataList[0].isFinal) {
                    dataList[0].isFinal = data.isFinal;
                    onCloseCandle(BinanceSocket.broker, data.symbol, data.interval, [...dataList]);
                }
            }
            else if (dataList[0].startTime < data.startTime) {
                dataList.unshift(data);
                if (dataList.length > numbler_candle_load) {
                    dataList.pop();
                }
                if (dataList[1] && !dataList[1].isFinal) {
                    dataList[1].isFinal = true;
                    console.log('forces final', dataList[1]);
                    onCloseCandle(BinanceSocket.broker, data.symbol, data.interval, dataList.slice(1));
                }
            }
            else {
                console.log('merge error');
            }
        }

        console.log(`${BinanceSocket.broker}: init timeframe`, timeframes);
        const fetchCandles = (candle: Candle) => {
            this.gLastUpdated[candle.symbol] = new Date().getTime();
            for (const tf of timeframes) {
                const data: RateData = {
                    symbol: candle.symbol,
                    startTime: util.getStartTime(tf, candle.startTime),
                    timestring: moment(util.getStartTime(tf, candle.startTime)).format('YYYY-MM-DD HH:mm:SS'),
                    open: +candle.open,
                    high: +candle.high,
                    low: +candle.low,
                    close: +candle.close,
                    volume: +candle.volume,
                    interval: tf,
                    isFinal: candle.isFinal && util.checkFinal(tf, candle.startTime)
                };
                mergeData(data, candle.isFinal);
            }
        }

        // this.gBinance.ws.candles(symbolList, '1m', fetchCandles);
        const streams = symbolList.map(symbol => `${symbol.toLowerCase()}@kline_1m`).join("/");
        const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

        // const ws = new WebSocket(url);
        const rws = new ReconnectingWebSocket(url, [], { WebSocket: WebSocket });

        // ws.on('open', () => {
        rws.addEventListener('open', () => {
            console.log(`binance: Socket connected`);
        });

        // ws.on('message', (mess) => {
        rws.addEventListener('message', (event) => {
            const mess = event.data;
            const { stream, data } = JSON.parse(mess.toString());
            const kline = data.k;
            const candle: Candle = {
                eventType: data.e,
                eventTime: data.E,
                symbol: data.s,
                startTime: kline.t,
                closeTime: kline.T,
                firstTradeId: kline.f,
                lastTradeId: kline.L,
                open: kline.o,
                high: kline.h,
                low: kline.l,
                close: kline.c,
                volume: kline.v,
                trades: kline.n,
                interval: kline.i,
                isFinal: kline.x,
                quoteVolume: kline.q,
                buyVolume: kline.V,
                quoteBuyVolume: kline.Q
            };

            fetchCandles(candle);
        });

        // ws.on('error', (err) => {
        rws.addEventListener('error', (err) => {
            console.error(`${BinanceSocket.broker}: WebSocket error`, err);
            // util.restartApp();
        });

        // ws.on('close', () => {
        rws.addEventListener('close', (event) => {
            console.error(`${BinanceSocket.broker}: WebSocket connection closed , ${event.code} ${event.reason}`);
            // util.restartApp();
        });

        const initCandle = async (symbol: string, tf: string) => {
            const rates = await util.getBinanceOHLCV(symbol, tf, numbler_candle_load);
            const lastData = this.gData[symbol][tf].reverse();
            this.gData[symbol][tf] = rates;
            this.gLastPrice[symbol] = this.gData[symbol][tf][0]?.close || 0;

            for (const data of lastData) {
                const lastRate = this.gData[symbol][tf][0];
                if (data.startTime >= lastRate.startTime) {
                    mergeData(data, data.isFinal);
                }
            }
        }

        for (const tf of timeframes) {
            console.log(`${BinanceSocket.broker}: init candle ${tf}...`);
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
                    console.error(`binance: ${symbol} not uppdated. [${new Date(lastTimeUpdated)}, ${new Date(now)}]`);
                    util.restartApp();
                }
            }
        }, timeInterval);
    }

    public getData(symbol: string, timeframe: string) {
        if (!this.gData || !this.gData[symbol] || !this.gData[symbol][timeframe]) return [];
        return this.gData[symbol][timeframe];
    }
};



import http from 'http';
import { Server } from "socket.io";
import { RateData, SymbolListener } from './common/Interface';
import express from "express";
import cors from "cors";
import body_parser from "body-parser";

const app = express();
const server = http.createServer(app);
app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(cors());
app.use(body_parser.json({ limit: "50mb" }));
app.use(body_parser.urlencoded({ extended: false, limit: "50mb" }));
app.get('/api/getOHLCV', async (req: any, res) => {
    try {
        const { symbol, timeframe } = req.query;
        const since = parseInt(req.query.since);
        const limit = parseInt(req.query.limit || 299);

        let data: Array<RateData> = binanceSocket.getData(symbol, timeframe);

        while (data.length > 0 && data[data.length - 1].startTime < since) data.pop();

        if (data.length === 0 || data[data.length - 1].startTime > since) {
            data = await util.getBinanceOHLCV(symbol, timeframe, limit + 1, since);
        }
        while (data.length > 0 && data[data.length - 1].startTime < since) data.pop();
        if (data.length > limit) data = data.slice(data.length - limit);

        res.json(data);
    }
    catch (err) {
        console.error(err);
        res.json([]);
    }
});

app.get('/api/getData', (req: any, res) => {
    try {
        const { symbol, timeframe } = req.query;
        let data: Array<RateData> = binanceSocket.getData(symbol, timeframe);
        res.json(data);
    }
    catch (err) {
        console.error(err);
        res.json([]);
    }
});

const io = new Server(server, {
    pingInterval: 25000,
    pingTimeout: 60000,
    maxHttpBufferSize: 200 * 1024 * 1024 //100MB
});
const port = 81;
let symbolListener: { [key: string]: boolean } = {};

io.on('connection', client => {
    console.log(`${BinanceSocket.broker}: client connected. total: ${io.sockets.sockets.size} connection`);

    client.on('disconnect', () => {
        console.log(`${BinanceSocket.broker}: onDisconnect - Client disconnected. total: ${io.sockets.sockets.size} connection`);
    });

    client.on('update_symbol_listener', (data: Array<SymbolListener>) => {
        symbolListener = {};
        for (const { symbol, timeframe, broker } of data) {
            if (broker !== BinanceSocket.broker) continue;
            let key = `${symbol}:${timeframe}`;
            symbolListener[key] = true;
        }
        console.log(`${BinanceSocket.broker} on update_symbol_listener. length = ${Object.keys(symbolListener).length}`);
    });
});


server.listen(port);

function onCloseCandle(broker: string, symbol: string, timeframe: string, data: Array<RateData>) {
    let key = `${symbol}:${timeframe}`;
    if (data.length <= 15) return;
    if (!symbolListener[key]) return;

    io.emit('onCloseCandle', { broker, symbol, timeframe, data });
}

const binanceSocket = new BinanceSocket();
binanceSocket.init(300, onCloseCandle);