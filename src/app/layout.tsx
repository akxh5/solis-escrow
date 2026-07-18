import type { Metadata } from "next";
import { Space_Grotesk, Space_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/context/WalletContext";
import { EscrowProvider } from "@/context/EscrowContext";
import { ToastProvider } from "@/context/ToastContext";
import { Analytics } from "@vercel/analytics/react";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Solis Escrow — Decentralized Escrow Marketplace on Stellar",
  description:
    "Browse, pledge to, and create trustless multi-party escrows secured by Soroban smart contracts on the Stellar Testnet. The open Escrow Explorer for decentralized bounties.",
  keywords: ["Stellar", "Soroban", "escrow", "bounty", "DeFi", "XLM", "marketplace", "crowdfunding"],
  openGraph: {
    title: "Solis Escrow Marketplace",
    description: "Trustless multi-escrow marketplace on Stellar.",
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
      className={`${spaceGrotesk.variable} ${spaceMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        {/*
          Provider order (outer → inner):
            WalletProvider   — wallet connection state (no deps)
            EscrowProvider   — escrow list state (no deps)
            ToastProvider    — notification system + DOM portal (wraps everything)
        */}
        <WalletProvider>
          <EscrowProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </EscrowProvider>
        </WalletProvider>
        <Analytics />
      </body>
    </html>
  );
}
