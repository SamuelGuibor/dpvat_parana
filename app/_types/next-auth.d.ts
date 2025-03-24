// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import NextAuth from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string // ou `role?: string` se o campo for opcional
    } & DefaultSession["user"]
  }

  interface User {
    role: string // Adiciona `role` ao objeto User do NextAuth
  }
}
