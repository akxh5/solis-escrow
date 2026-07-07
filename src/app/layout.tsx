import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/context/WalletContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Solis Escrow — Decentralized Bounty Platform on Stellar",
  description:
    "Solis Escrow is a trustless crowdfunding and bounty platform built on the Stellar Network. Pledge XLM to open-source bounties secured by Soroban smart contracts.",
  keywords: ["Stellar", "Soroban", "escrow", "bounty", "crowdfunding", "Web3", "XLM"],
  openGraph: {
    title: "Solis Escrow",
    description: "Decentralized bounties on Stellar.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
