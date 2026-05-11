import { Client, GatewayIntentBits, Partials } from "discord.js";
import dotenv from "dotenv";
import { startWorker } from "./worker.js";
import { setupReactionListener } from "./reactions.js";
import { setupPointSystem } from "./ponto.js";
import { sendPointPanel } from "./sendPointMessage.js"

dotenv.config();

export const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
    ],
});

client.once("clientReady", async () => {
    console.log(`🤖 Bot online: ${client.user.tag}`);

    const channel = await client.channels.fetch(
        process.env.DISCORD_POINT_CHANNEL
    );
    const messages = await channel.messages.fetch({ limit: 10 });

    const alreadyExists = messages.find(m =>
        m.content.includes("Controle de ponto diário")
    );

    if (!alreadyExists) {
        await sendPointPanel(channel);
    }

    setupPointSystem(client);
    setupReactionListener(client);
    startWorker();
});

client.login(process.env.DISCORD_TOKEN);