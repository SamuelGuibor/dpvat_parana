import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import { startWorker } from "./worker.js";

dotenv.config(); 

export const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once("clientReady", () => {
  console.log(`🤖 Bot online: ${client.user.tag}`);
  startWorker();
});

client.login(process.env.DISCORD_TOKEN);