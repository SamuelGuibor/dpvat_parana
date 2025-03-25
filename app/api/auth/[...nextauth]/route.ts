import NextAuth from "next-auth"
import { authOptions } from "@/app/_lib/auth"
//import { EmailProvider } from "next-auth/providers/email"

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
