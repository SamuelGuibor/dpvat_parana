import { PrismaClient } from "@prisma/client";
import { client } from "./index.js";

const prisma = new PrismaClient();

export async function startWorker() {
    console.log("🔥 Worker iniciado");

    setInterval(async () => {
        console.log("⏱️ Rodando verificação...");

        // Busca apenas as que ainda não foram enviadas E que já chegou a hora
        const notifications = await prisma.discord.findMany({
            where: {
                sent: false,
            },
        });

        console.log(`Notificações encontradas para enviar: ${notifications.length}`);

        // for (const n of notifications) {
        //     try {
        //         console.log("📤 Enviando notificação para:", n.nome || n.telefone);

        //         const channel = await client.channels.fetch(n.channelId);

        //         if (!channel || !channel.isTextBased()) {
        //             console.warn("Canal inválido ou não é de texto:", n.channelId);
        //             continue;
        //         }

        //         // Mensagem personalizada que você queria
        //         const conteudoPersonalizado = `${n.nome ? `"${n.nome}"` : 'Cliente'} com o telefone "${n.telefone}", será notificada em "${n.hours || 0}h" @${n.equipe || n.message}`;

        //         await channel.send({
        //             content: `<@&${n.message}>`,   // ping do role
        //             embeds: [
        //                 {
        //                     title: "📢 Novo Cliente - Notificação Agendada",
        //                     description: conteudoPersonalizado,
        //                     color: 0x5865F2,
        //                     fields: [
        //                         {
        //                             name: "👤 Nome",
        //                             value: `**${n.nome || "Não informado"}**`,
        //                             inline: true,
        //                         },
        //                         {
        //                             name: "📞 Telefone",
        //                             value: n.telefone || "Não informado",
        //                             inline: true,
        //                         },
        //                         {
        //                             name: "⏰ Prazo",
        //                             value: n.hours ? `${n.hours}h` : "Não definido",
        //                             inline: true,
        //                         },
        //                         {
        //                             name: "Equipe",
        //                             value: `@${n.equipe || n.message}`,
        //                             inline: true,
        //                         },
        //                     ],
        //                     timestamp: new Date(),
        //                 },
        //             ],
        //         });

        //         // Marca como enviada
        //         await prisma.discord.update({
        //             where: { id: n.id },
        //             data: { sent: true },
        //         });

        //         console.log("✅ Enviado com sucesso!");

        //     } catch (err) {
        //         console.error("Erro ao enviar notificação:", err);
        //     }
        // }

        for (const n of notifications) {
            try {
                const channel = await client.channels.fetch(n.channelId);
                if (!channel || !channel.isTextBased()) continue;

                // Mention real para notificação (fica laranja e pinga)
                const roleMention = `<@&${n.equipe || n.message}>`;

                // Texto limpo para mostrar dentro do embed
                // const equipeNome = n.equipe || n.message || "Não definida";

                const conteudoPersonalizado = `**${n.nome ? `${n.nome}**` : "Cliente"} com o telefone **${n.telefone}**, será notificada em **${n.hours || 0}h**`;

                await channel.send({
                    content: roleMention,   // ← Ping real aqui (laranja + notificação)

                    embeds: [
                        {
                            title: "📢 Novo Cliente - Notificação Agendada",
                            description: conteudoPersonalizado,
                            color: 0x5865F2,
                            fields: [
                                { name: "👤 Nome", value: `**${n.nome || "Não informado"}**`, inline: true },
                                { name: "📞 Telefone", value: n.telefone || "Não informado", inline: true },
                                { name: "⏰ Prazo", value: n.hours ? `${n.hours}h` : "Não definido", inline: true },
                                {
                                    name: "👥 Equipe",
                                    value: `${roleMention}`,   // mention + nome limpo
                                    inline: true
                                },
                            ],
                            timestamp: new Date(),
                            footer: { text: "Notificação automática" }
                        }
                    ]
                });

                await prisma.discord.update({
                    where: { id: n.id },
                    data: { sent: true }
                });

                console.log("✅ Enviado!");

            } catch (err) {
                console.error("Erro ao enviar:", err);
            }
        }
    }, 6000); // a cada 6 segundos
}