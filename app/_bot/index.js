import { Client, GatewayIntentBits, Partials } from "discord.js";
import dotenv from "dotenv";
import { startWorker } from "./worker.js";
import { setupReactionListener } from "./reactions.js";

dotenv.config();

export const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,           // necessário
        GatewayIntentBits.GuildMessageReactions,   // ← ESSENCIAL para reações
        // GatewayIntentBits.MessageContent,       // só se precisar ler conteúdo de mensagens
    ],
    partials: [
        Partials.Message,    // ← obrigatório para reações em mensagens antigas
        Partials.Channel,
        Partials.Reaction,   // ← obrigatório
    ],
});

client.once("clientReady", () => {
    console.log(`🤖 Bot online: ${client.user.tag}`);
    setupReactionListener(client);
    startWorker();
});

client.login(process.env.DISCORD_TOKEN);