// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import NextAuth from "next-auth";
import { JWT } from "next-auth/jwt";

declare module "next-auth" {
  interface User {
    role?: string;
  }

  interface Session {
    accessToken?: string;
    user: {
      id: string;
      role: string;
      name?: string | null;
      email?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    accessToken?: string;
  }
}