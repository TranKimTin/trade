// server
import http from 'http';
import { Server } from "socket.io";
import { RateData } from './BinanceFuture';
import * as util from './util';
import { BinanceSocket } from './socket_binance';
import { BybitSocket } from './socket_bybit';
import { OkxSocket } from './socket_okx';

util.useSport();

const port = 8081;
// let clientList: Array<Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>> = [];


async function main(numbler_candle_load = 300) {
    let binanceSocket = new BinanceSocket();
    let bybitSocket = new BybitSocket();
    let okxSocket = new OkxSocket();

    binanceSocket.init(numbler_candle_load, onCloseCandle);
    bybitSocket.init(numbler_candle_load, onCloseCandle);
    okxSocket.init(numbler_candle_load, onCloseCandle);

}

function onCloseCandle(broker: string, symbol: string, timeframe: string, data: Array<RateData>) {
    io.emit('onCloseCandle', { broker, symbol, timeframe, data });
}

const server = http.createServer();
const io = new Server(server);

let cnt = 0;
io.on('connection', client => {
    cnt++;
    console.log(`client connected. total: ${cnt} connection`);

    client.on('disconnect', () => {
        cnt--;
        console.log(`onDisconnect - Client disconnected. total: ${cnt} connection`);
    });
});
server.listen(port);
main();

