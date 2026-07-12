/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaAdapter } from "@auth/prisma-adapter";
import { AuthOptions } from "next-auth";
import { db } from "./prisma";
import { Adapter } from "next-auth/adapters";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import jwt from "jsonwebtoken";
import { verifyPassword, hashPassword } from "./password";
import { rateLimit } from "./rate-limit";

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(db) as Adapter,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        cpf: { label: "CPF", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.cpf || !credentials?.password) {
          throw new Error("CPF e senha são obrigatórios");
        }

        // Força-bruta: 10 tentativas por IP e 5 por CPF a cada 15 minutos.
        const forwarded = (req?.headers?.["x-forwarded-for"] as string) ?? "";
        const ip = forwarded.split(",")[0]?.trim() || "unknown";
        const windowMs = 15 * 60_000;
        if (!rateLimit(`login:ip:${ip}`, 10, windowMs) || !rateLimit(`login:cpf:${credentials.cpf}`, 5, windowMs)) {
          throw new Error("Muitas tentativas de login. Aguarde alguns minutos e tente novamente.");
        }

        // CPF não é único no banco: verifica a senha contra cada candidato.
        // Senhas legadas em texto puro são re-gravadas como hash bcrypt no
        // primeiro login válido (migração lazy).
        const candidates = await db.user.findMany({
          select: { id: true, email: true, name: true, role: true, password: true, service: true },
          where: { cpf: credentials.cpf, password: { not: null } },
          take: 10,
        });

        for (const user of candidates) {
          if (!user.password) continue;
          const { ok, needsRehash } = await verifyPassword(credentials.password, user.password);
          if (!ok) continue;

          if (needsRehash) {
            const newHash = await hashPassword(credentials.password);
            await db.user
              .update({ where: { id: user.id }, data: { password: newHash } })
              .catch((err) => console.error("[AUTH] Falha ao re-hashear senha legada:", err));
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            service: user.service ?? undefined,
          };
        }

        throw new Error("Usuário não encontrado ou senha inválida");
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.service = user.service;
      }
      if (account) {
        token.accessToken = account.access_token;
      }
      // Quando o usuário edita o próprio perfil, o client chama update({...})
      // e propagamos os novos dados para o token (e, assim, para a sessão).
      if (trigger === "update" && session) {
        if (session.name) token.name = session.name;
        if (session.email) token.email = session.email;
        if (session.picture !== undefined) token.picture = session.picture;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.service = token.service as string;
      }
      session.accessToken = token.accessToken as string;
      return session;
    },
  },
  secret: process.env.NEXT_AUTH_SECRET,
  session: {
    strategy: "jwt",
    // maxAge explícito: a sessão dura 30 dias e é renovada a cada 24h de uso.
    // Sem isso, depende do default e fica difícil diagnosticar expiração.
    maxAge: 30 * 24 * 60 * 60, // 30 dias
    updateAge: 24 * 60 * 60, // renova a cada 24h
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30 dias — alinhado com a sessão
  },
  pages: {
    signIn: "/login",
  },
};