/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import NextAuth from "next-auth";
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import { JWT } from "next-auth/jwt";

declare module "next-auth" {
  interface User {
    role?: string;
    service?: string;
  }

  interface Session {
    accessToken?: string;
    user: {
      id: string;
      role: string;
      service?: string;
      name?: string | null;
      email?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    service?: string;
    accessToken?: string;
  }
}