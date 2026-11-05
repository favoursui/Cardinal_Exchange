import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { WalletProvider } from "@/features/wallet/wallet-provider";

export const metadata: Metadata = {
  title: { default: "Cardinal Exchange", template: "%s | Cardinal Exchange" },
  description: "Cardinal Exchange on QMS testnet.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><WalletProvider>{children}</WalletProvider></body></html>;
}
