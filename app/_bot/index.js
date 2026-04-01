import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once("ready", () => {
  console.log(`🤖 Bot online: ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);