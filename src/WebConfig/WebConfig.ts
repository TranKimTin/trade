import express from "express";
import cors from "cors";
import morgan from "morgan";
import body_parser from "body-parser";
import fs from "fs";
import path from "path";
import * as util from '../util'
import { isValidCondition } from "../Expr";
import { BotInfo, Node } from "../Interface";
import { Server } from "socket.io";
import http from 'http';


export const BOT_DATA_DIR = '../botData';
if (!fs.existsSync(BOT_DATA_DIR)) {
    fs.mkdirSync(BOT_DATA_DIR);
}


const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    pingInterval: 25000,
    pingTimeout: 60000
});

let cnt = 0;
const TAG = 'WebConfigSocket';
io.on('connection', client => {
    cnt++;
    console.log(`${TAG}: client connected. total: ${cnt} connection`);

    client.on('disconnect', () => {
        cnt--;
        console.log(`${TAG}: onDisconnect - Client disconnected. total: ${cnt} connection`);
    });
});

app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(cors());
app.use(
    morgan(
        ":date[iso] :remote-addr :remote-user :user-agent :method :url HTTP/:http-version :status :res[content-length] - :response-time ms"
    )
);
app.use(body_parser.json({ limit: "50mb" }));
app.use(body_parser.urlencoded({ extended: false, limit: "50mb" }));
app.use(express.static(path.join(__dirname, 'public')));

function onChangeConfig(botName: string) {
    io.emit('onUpdateConfig', botName);
}

function validatekBotName(botName: string) {
    const invalidChars = /[\/\\:*?"<>|]/;
    return botName && botName.length < 50 && !invalidChars.test(botName);
}

function buildRoute(botInfo: BotInfo): boolean {
    const elements = botInfo.treeData.elements;
    const nodes = elements.nodes?.map(item => item.data) || [];
    const edges = elements.edges?.map(item => item.data) || [];

    const nodeList: { [key: string]: Node } = {};
    for (let node of nodes) {
        const { id } = node;
        nodeList[id] = { data: node, id, next: [] };
    }

    for (let edge of edges) {
        const { source, target } = edge;
        nodeList[source].next.push(nodeList[target]);
    }

    if (!nodeList['start']) return false;

    const visited: { [key: string]: boolean } = {};
    let ret = true;

    const dfs = (node: Node) => {
        if (visited[node.id]) ret = false;
        if (!ret) return;

        visited[node.id] = true;
        for (let child of node.next) {
            dfs(child);
        }
        visited[node.id] = false;
    }
    dfs(nodeList['start']);
    if (!ret) return false;

    botInfo.route = nodeList['start'];

    return true;
}

app.post("/save", (req, res) => {
    const data: BotInfo = req.body;

    const botName = data.botName;
    if (!validatekBotName(botName)) {
        return res.json({ code: 400, message: 'Tên bot không hợp lệ ' + botName });
    }

    const edges = data.treeData.elements.edges?.filter(item => !item.removed).map(item => item.data) || []; //{source, target, id}
    const nodes = data.treeData.elements.nodes?.filter(item => !item.removed).map(item => item.data) || []; //{id, name}

    console.log({ edges, nodes });

    for (let node of nodes) {
        if (!isValidCondition(node)) {
            console.log('invalid condition ', node.value);
            return res.json({ code: 400, message: 'Điều kiện không hợp lệ ' + node.value });
        }
    }

    if (!buildRoute(data)) {
        return res.json({ code: 400, message: 'Điều kiện vòng tròn' });
    }

    const botPath = path.join(BOT_DATA_DIR, `${data.botName}.json`);
    fs.writeFileSync(botPath, JSON.stringify(data));
    onChangeConfig(data.botName);

    res.json({ code: 200, message: "Lưu thành công" });
});

app.post("/check", (req, res) => {
    const data = req.body;
    console.log('check', data);

    if (!data.id || !isValidCondition(data)) {
        return res.json({ code: 400, message: `Điều kiện không hợp lệ ${data.value}` });
    }

    res.json({ code: 200, message: "ok" });
});

app.get("/getBotInfo", (req, res) => {
    const botName: any = req.query.botName;
    if (!validatekBotName(botName)) {
        return res.json({ code: 400, message: 'Tên bot không hợp lệ ' + botName });
    }
    let data: BotInfo = {
        treeData: { elements: { nodes: [], edges: [] } },
        timeframes: [],
        symbolList: [],
        botName: '',
        idTelegram: '',
        route: {
            data: {
                id: "start",
                type: "start",
                value: "Start",
            }, id: 'start', next: []
        }
    };
    if (fs.existsSync(`${BOT_DATA_DIR}/${botName}.json`)) {
        data = JSON.parse(fs.readFileSync(`${BOT_DATA_DIR}/${botName}.json`).toString());
    }
    res.json({
        code: 200,
        message: "ok",
        data
    });
});

app.get('/getSymbolList', async (req, res) => {
    let [binanceSymbolList, bybitSymbolList, okxSymbolList, binanceFutureSymbolList, bybitFutureSymbolList] = await Promise.all([
        util.getBinanceSymbolList(),
        util.getBybitSymbolList(),
        util.getOkxSymbolList(),
        util.getBinanceFutureSymbolList(),
        util.getBybitFutureSymbolList()
    ]);

    binanceSymbolList = binanceSymbolList.map(item => `${'binance'}:${item}`);
    bybitSymbolList = bybitSymbolList.map(item => `${'bybit'}:${item}`);
    okxSymbolList = okxSymbolList.map(item => `${'okx'}:${item}`);
    binanceFutureSymbolList = binanceFutureSymbolList.map(item => `${'binance_future'}:${item}`);
    bybitFutureSymbolList = bybitFutureSymbolList.map(item => `${'bybit_future'}:${item}`);


    const symbolList = [...binanceSymbolList, ...bybitSymbolList, ...okxSymbolList, ...binanceFutureSymbolList, ...bybitFutureSymbolList];
    res.json({ code: 200, message: "ok", data: symbolList });
});

app.get('/getBotList', (req, res) => {
    const botList = fs.readdirSync(BOT_DATA_DIR);
    const data = botList.map(item => item.replace('.json', '')) || [];
    res.json({ code: 200, message: "ok", data });
});

app.put('/delete', (req, res) => {
    const { botName } = req.query as { botName: string };
    const botFile = path.join(BOT_DATA_DIR, `${botName}.json`);
    if (fs.existsSync(botFile)) {
        fs.unlinkSync(botFile);
        onChangeConfig(botName);
    }
    res.json({ code: 200, message: "Xóa thành công", data: [] });
});

const port = 8080;
server.listen(port, () => {
    console.log(`\nStart server at: ${new Date()}
                    HTTP server is listening at: ${"localhost"}:${port}
        `);
});