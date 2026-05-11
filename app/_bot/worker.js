import { PrismaClient } from "@prisma/client";
import { client } from "./index.js";

const prisma = new PrismaClient();

export async function startWorker() {
    console.log("🔥 Worker iniciado");

    let lastRunDay = null;

    setInterval(async () => {
        try {
            const now = new Date();
            const today = now.toDateString();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
            if (now.getHours() === 12 && now.getMinutes() === 40 && lastRunDay !== today) {
                lastRunDay = today;

                const reportsConfig = [
                    {
                        channelId: '1493999520139448522',
                        name: 'Contratações',
                        getData: async () => {
                            return await prisma.discord.count({
                                where: {
                                    channelId: '1493999520139448522',
                                    createdAt: {
                                        gte: startOfDay,
                                        lte: endOfDay,
                                    },
                                },
                            });
                        },
                        buildEmbed: (total) => ({
                            title: "📊 Relatório Diário de Contratações",
                            description: "Resumo automático gerado ao final do dia.",
                            color: 0x5865F2,
                            fields: [
                                {
                                    name: "👥 Total de Contratados",
                                    value: `\`\`\`${total} pessoas\`\`\``,
                                    inline: true,
                                },
                            ],
                        }),
                    },

                    {
                        channelId: '1491866020820811837',
                        name: 'Entradas',
                        getData: async () => {
                            return await prisma.discord.count({
                                where: {
                                    channelId: '1491866020820811837',
                                    createdAt: {
                                        gte: startOfDay,
                                        lte: endOfDay,
                                    },
                                },
                            });
                        },
                        buildEmbed: (total) => ({
                            title: "📉 Relatório de Entradas",
                            description: "Resumo de Entradas Diarias.",
                            color: 0xED4245,
                            fields: [
                                {
                                    name: "🚪 Total de Entradas",
                                    value: `\`\`\`${total} pessoas\`\`\``,
                                    inline: true,
                                },
                            ],
                        }),
                    },

                    {
                        channelId: '1491866065293283428',
                        name: 'Saidas',
                        getData: async () => {
                            return await prisma.discord.count({
                                where: {
                                    channelId: '1491866065293283428',
                                    createdAt: {
                                        gte: startOfDay,
                                        lte: endOfDay,
                                    },
                                },
                            });
                        },
                        buildEmbed: (total) => ({
                            title: "📉 Relatório de Saídas",
                            description: "Resumo de Saídas Diarias.",
                            color: 0xED4245,
                            fields: [
                                {
                                    name: "🚪 Total de Saídas",
                                    value: `\`\`\`${total} pessoas\`\`\``,
                                    inline: true,
                                },
                            ],
                        }),
                    },
                ];

                for (const config of reportsConfig) {
                    try {
                        const total = await config.getData();

                        const channel = await client.channels.fetch(config.channelId);

                        const embed = {
                            ...config.buildEmbed(total),
                            timestamp: new Date(),
                            footer: {
                                text: "Sistema automático • Bot Paraná Seguros",
                            },
                        };

                        await channel.send({
                            embeds: [embed],
                        });
                    }

                    catch (erro) {
                        console.log('Problema ao enviar relatorios diarios', erro)
                    }
                }
            }
        } catch (erro) {
            console.log("deu erro ao enviar msg diaria", erro)
        }

    }, 60000);

    setInterval(async () => {
        console.log("⏱️ Rodando verificação...");

        const now = new Date();

        const notifications = await prisma.discord.findMany({
            where: {
                sent: false,
            },
        });

        for (const n of notifications) {
            try {
                const channel = await client.channels.fetch(n.channelId);
                if (!channel || !channel.isTextBased()) continue;

                const roleMention = `<@&${n.equipe || n.message}>`;

                let messageSent;

                if (n.channelId === '1493999520139448522') {
                    const embedInicial = {
                        title: "❇️ NOVO CONTRATADO",
                        description: `Um cliente acaba de ser contratado!`,
                        color: 0xFF0000,
                        fields: [
                            {
                                name: "👤 Nome do Cliente",
                                value: `\`\`\`${n.nome || "Não informado"}\`\`\``,
                                inline: false,
                            },
                            {
                                name: "📞 Telefone",
                                value: `\`\`\`${n.telefone || "Não informado"}\`\`\``,
                                inline: false,
                            },
                        ],
                        timestamp: new Date(),
                        footer: {
                            text: "Atualização automática do sistema",
                        },
                    };

                    messageSent = await channel.send({
                        content: roleMention,
                        embeds: [embedInicial]
                    });

                    await prisma.discord.update({
                        where: { id: n.id },
                        data: { firstSent: true, sent: true }
                    });

                    console.log(`📨 1ª mensagem enviada → ${n.nome || n.telefone}`);
                    continue;
                }

                // ========================
                // 1ª MENSAGEM - Inicial
                // ========================
                if (!n.firstSent) {
                    const embedInicial = {
                        title: "📢 Novo Cliente Agendado",
                        description: `**${n.nome || "Cliente"}** com o telefone **${n.telefone}**\nNotificação agendada para daqui a **${n.hours || 0}h**.`,
                        color: 0x5865F2,
                        fields: [
                            { name: "👤 Nome", value: `**${n.nome || "Não informado"}**`, inline: true },
                            { name: "📞 Telefone", value: n.telefone || "Não informado", inline: true },
                            { name: "⏰ Prazo", value: `${n.hours || 0}h`, inline: true },
                        ],
                        timestamp: new Date(),
                        footer: { text: "Notificação inicial • Reaja para marcar" }
                    };

                    messageSent = await channel.send({
                        content: roleMention,
                        embeds: [embedInicial]
                    });

                    // Adiciona as reações
                    await addReactions(messageSent);

                    // Marca que a primeira mensagem foi enviada
                    await prisma.discord.update({
                        where: { id: n.id },
                        data: { firstSent: true }
                    });

                    console.log(`📨 1ª mensagem enviada → ${n.nome || n.telefone}`);
                    continue;
                }

                // ========================
                // 2ª MENSAGEM - Lembrete
                // ========================
                if (n.executeAt && n.executeAt <= now) {
                    const embedLembrete = {
                        title: "⏰ Lembrete de Prazo Expirado",
                        description: `⚠️ **${n.nome || "Cliente"}** com o telefone **${n.telefone}**\nO prazo de ${n.hours || 0}h já expirou!`,
                        color: 0xED4245,
                        fields: [
                            { name: "👤 Nome", value: `**${n.nome || "Não informado"}**`, inline: true },
                            { name: "📞 Telefone", value: n.telefone || "Não informado", inline: true },
                            { name: "⏰ Prazo Original", value: `${n.hours || 0}h`, inline: true },
                        ],
                        timestamp: new Date(),
                        footer: { text: "Lembrete • Reaja para marcar" }
                    };

                    messageSent = await channel.send({
                        content: roleMention,
                        embeds: [embedLembrete]
                    });

                    await addReactions(messageSent);

                    // Marca como enviada (2ª mensagem)
                    await prisma.discord.update({
                        where: { id: n.id },
                        data: { sent: true }
                    });

                    console.log(`✅ 2ª mensagem enviada → ${n.nome || n.telefone}`);
                }

            } catch (err) {
                console.error(`Erro ao processar notificação ${n.id}:`, err);
            }
        }
    }, 15000); // 15 segundos
}

// ========================
// Função auxiliar para adicionar reações
// ========================
async function addReactions(discordMessage) {
    try {
        await discordMessage.react("✅");  // Já visualizei
        await discordMessage.react("❌");  // Excluir
        console.log("✅ Reações adicionadas");
    } catch (err) {
        console.error("Erro ao adicionar reações:", err);
    }
}