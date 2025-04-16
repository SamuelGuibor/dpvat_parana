"use server";

import { db } from "@/app/_lib/prisma";

// Function to normalize phone numbers to international format
function normalizePhoneNumber(phone: string): string {
  // Remove non-digit characters (parentheses, spaces, dashes)
  const digits = phone.replace(/\D/g, "");
  // Assume Brazilian numbers (starting with 55 if not included)
  if (!digits.startsWith("55") && digits.length <= 11) {
    return `55${digits}`;
  }
  return `+${digits}`;
}

// Function to validate message content
function validateMessage(message: string): string {
  // Trim whitespace and ensure message is not empty
  const trimmedMessage = message.trim();
  if (!trimmedMessage) {
    throw new Error("Mensagem não pode ser vazia");
  }
  // Ensure message is within WhatsApp's typical length limit (4096 characters)
  if (trimmedMessage.length > 4096) {
    throw new Error("Mensagem excede o limite de 4096 caracteres");
  }
  // Remove or encode problematic characters if needed (e.g., control characters)
  return trimmedMessage.replace(/[\x00-\x1F\x7F]/g, "");
}

export async function SendMessages({
  role,
  message,
}: {
  role: string;
  message: string;
}) {
  try {
    // Validate message content
    const validatedMessage = validateMessage(message);

    // Fetch users with the specified role who have a phone number
    const users = await db.user.findMany({
      where: {
        role,
        telefone: {
          not: null,
        },
      },
      select: {
        telefone: true,
      },
    });

    if (users.length === 0) {
      throw new Error(`Nenhum usuário com a role ${role} encontrado.`);
    }

    const phoneNumbers = users.map((user) => normalizePhoneNumber(user.telefone!));
    const instanceToken = process.env.GZAPPY_INSTANCE_TOKEN;
    const failedNumbers: string[] = [];
    let sentCount = 0;

    for (const phone of phoneNumbers) {
      try {
        const response = await fetch("https://v2-api.gzappy.com/message/send-text", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${instanceToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            phone,
            message: validatedMessage,
          }),
        });

        if (!response.ok) {
          let errorData;
          try {
            errorData = await response.json();
          } catch {
            errorData = { message: "Nenhuma informação de erro retornada" };
          }
          console.error(`Falha ao enviar mensagem para ${phone}:`, {
            status: response.status,
            statusText: response.statusText,
            errorData: JSON.stringify(errorData, null, 2), // Pretty-print error data
          });
          failedNumbers.push(phone);
          continue; // Continue with the next number
        }

        sentCount++;
      } catch (error: any) {
        console.error(`Erro ao enviar mensagem para ${phone}:`, error.message);
        failedNumbers.push(phone);
        continue; // Continue with the next number
      }
    }

    if (failedNumbers.length > 0) {
      throw new Error(
        `Falha ao enviar mensagens para ${failedNumbers.length} números: ${failedNumbers.join(", ")}`
      );
    }

    return { success: true, sentTo: sentCount };
  } catch (error: any) {
    console.error("Erro em SendMessages:", error);
    throw new Error(`Erro ao enviar mensagens: ${error.message}`);
  }
}