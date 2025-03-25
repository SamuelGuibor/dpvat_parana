// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import NextAuth from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string 
      cpf: string
    } & DefaultSession["user"]
  }

  interface User {
    role: string
    cpf: string 
  }
}
