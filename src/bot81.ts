import BotRSI_CCI from "./bot_rsi_cci";

let bot = new BotRSI_CCI(666168084, 162876164, 1758247327, 'config81.txt', 81, 'BOT_81', true);
bot.init(3 * 60 * 1000);
