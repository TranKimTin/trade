import { BotInfo, CustomRequest, NodeData } from '../../common/Interface';
import * as BotConfig from '../business/BotConfig';

export async function getBotInfo(req: any, res: any) {
    try {
        const botName = req.query.botName;
        const data = await BotConfig.getBotInfo(botName);

        res.json({ code: 200, message: "ok", data });
    }
    catch (err: any) {
        console.error(err);
        res.json({ code: 400, message: err, data: [] });
    }
}

export async function getSymbolList(req: any, res: any) {
    try {
        const data = await BotConfig.getSymbolList();
        res.json({ code: 200, message: "ok", data });
    }
    catch (err: any) {
        console.error(err);
        res.json({ code: 400, message: err, data: [] });
    }
}

export async function getBotList(req: any, res: any) {
    try {
        const data = await BotConfig.getBotList();
        res.json({ code: 200, message: "ok", data });
    }
    catch (err: any) {
        console.error(err);
        res.json({ code: 400, message: err, data: [] });
    }
}

export async function getHistoryOrder(req: any, res: any) {
    try {
        const botName: string = req.params.botName;
        const data = await BotConfig.getHistoryOrder(botName);
        res.json({ code: 200, message: "ok", data });
    }
    catch (err: any) {
        console.error(err);
        res.json({ code: 400, message: err, data: [] });
    }
}

export async function saveBot(req: any, res: any) {
    try {
        const data: BotInfo = req.body;
        await BotConfig.saveBot(data);
        (req as unknown as CustomRequest).onChangeConfig(data.botName);

        res.json({ code: 200, message: "Lưu thành công" });
    }
    catch (err: any) {
        console.error(err);
        res.json({ code: 400, message: err, data: [] });
    }
}

export async function checkNode(req: any, res: any) {
    try {
        const data: NodeData = req.body;
        await BotConfig.checkNode(data);

        res.json({ code: 200, message: "ok" });
    }
    catch (err: any) {
        console.error(err);
        res.json({ code: 400, message: err, data: [] });
    }
}

export async function deleteBot(req: any, res: any) {
    try {
        const botName: string = req.query.botName;
        await BotConfig.deleteBot(botName);
        (req as unknown as CustomRequest).onChangeConfig(botName);
        res.json({ code: 200, message: "Xóa thành công", data: [] });
    }
    catch (err: any) {
        console.error(err);
        res.json({ code: 400, message: err, data: [] });
    }
}   