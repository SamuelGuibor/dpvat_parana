// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import NextAuth from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string 
    } & DefaultSession["user"]
  }

  interface User {
    role: string  
  }
}
