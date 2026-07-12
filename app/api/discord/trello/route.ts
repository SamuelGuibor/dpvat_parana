// Webhook do Trello → alertas no Discord.
//
// Auth: shared secret na URL de callback do webhook (?secret=...) validado
// contra a env TRELLO_WEBHOOK_SECRET. O HEAD fica aberto — é só o handshake
// que o Trello faz ao registrar o webhook.

import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSecret } from "@/app/_shared/lib/webhook-auth";
// import axios from "axios";

export async function HEAD() {
    return new NextResponse(null, { status: 200 });
}

export async function POST(req: NextRequest) {
    if (!verifyWebhookSecret(req, "TRELLO_WEBHOOK_SECRET")) {
        return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    const body = await req.json();

    console.log("🔥 CHEGOU EVENTO DO TRELLO");
    console.log(JSON.stringify(body, null, 2));

    const action = body?.action;
    const model_format = body.model

    // if (action?.type === "copyCard"){
    //     const name = action?.data.cardSource.name

    //     const match = name.match(/^(\d+)/);
    //     const currentNumber = parseInt(match[1], 10);
    //     const newNumber = currentNumber + 1;

    //     const newName = name.replace(/^(\d+)/, String(newNumber));
    //     await axios.put(`https://api.trello.com/1/cards/698cb83f2c7699c911256843`,{},
    //         {
    //             params: {
    //             key: process.env.TRELLO_KEY,
    //             token: process.env.TRELLO_TOKEN,
    //             name: newName,
    //             },
    //         }
    //     );
        
    //     console.log("Atualizado:", newName);

    //     return NextResponse.json({ ok: true });
    // }

    if (action?.type === "updateCard" && action.data.listAfter) {
        const card = action.data.card;
        const listAfter = action.data.listAfter.name;

        if (listAfter === "FALTA SENHA") {
            await fetch(`${process.env.DISCORD_WEBHOOK_URL}?thread_id=1489626708268290168`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    content: `<@&1489369880854794463>`,
                    embeds: [
                        {
                            title: `📥 Cliente aguardando senha: **[${card.name}]**`,
                            description: `**${card.name}** \n\n 🪄 Você Pode Usar no BotConversa o Fluxo **SENHA SÚTIL**`,
                            color: 0xffd5d2,
                            fields: [
                                {
                                    name: "🏷️ Etiqueta",
                                    value: model_format.name,
                                    inline: false,
                                },
                            ],
                            timestamp: new Date().toISOString(),
                        },
                    ],
                }),
            });

            console.log("✅ Mensagem enviada pro Discord");
        }

        else if (listAfter === "FAZER ROTEIRO PREV") {
            await fetch(`${process.env.DISCORD_WEBHOOK_URL_JURIDICO}?thread_id=1490716935225348156`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    content: `<@&1489369880854794463>`,
                    embeds: [
                        {
                            title: "📢 Solicitação urgente: elaboração de roteiro previdenciário",
                            description: `**${card.name}**`,
                            color: 0xfce4a6,
                            fields: [
                                {
                                    name: "🏷️ Etiqueta",
                                    value: model_format.name,
                                    inline: false,
                                },
                            ],
                            timestamp: new Date().toISOString(),
                        },
                    ],
                }),
            });

            console.log("✅ Mensagem enviada pro Discord");
        }

        else if (listAfter === "DISTRIBUIÇÃO DE SOLICITAÇÕES") {
            await fetch(`${process.env.DISCORD_WEBHOOK_URL_PRONTUARIO}?thread_id=1491866020820811837`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    content: `<@&1489369880854794463>`,
                    embeds: [
                        {
                            title: "✨ Foi Enviado um Novo Prontuario",
                            description: `**${card.name}**`,
                            color: 0xfce4a6,
                            fields: [
                                {
                                    name: "🏷️ Etiqueta",
                                    value: model_format.name,
                                    inline: false,
                                },
                            ],
                            timestamp: new Date().toISOString(),
                        },
                    ],
                }),
            });

            console.log("✅ Mensagem enviada pro Discord");
        }

        else if (listAfter === "DISTRIBUIÇÃO DE PROCESSOS") {
            await fetch(`${process.env.DISCORD_WEBHOOK_URL_PRONTUARIO}?thread_id=1491866065293283428`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    content: `<@&1489369880854794463>`,
                    embeds: [
                        {
                            title: "✨ Foi Recebido um Novo Prontuario",
                            description: `**${card.name}**`,
                            color: 0xfce4a6,
                            fields: [
                                {
                                    name: "🏷️ Etiqueta",
                                    value: model_format.name,
                                    inline: false,
                                },
                            ],
                            timestamp: new Date().toISOString(),
                        },
                    ],
                }),
            });

            console.log("✅ Mensagem enviada pro Discord");
        }
    }

    return NextResponse.json({ ok: true });
}