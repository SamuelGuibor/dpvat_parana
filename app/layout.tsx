import type { Metadata } from "next";
import "./globals.css";
import { Mulish } from "next/font/google";
import AuthProvider from "./_providers/auth";


const mulish = Mulish({
  subsets: ["latin-ext"],
});

export const metadata: Metadata = {
  title: "DPVAT Paraná",
  description: "DPVAT Paraná",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${mulish.className} antialiased`}
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
