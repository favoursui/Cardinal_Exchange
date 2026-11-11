import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { TradingSettingsProvider } from "@/features/trading/settings";
import { WalletProvider } from "@/features/wallet/wallet-provider";

export const metadata: Metadata = {
  title: { default: "Cadinal Exchange", template: "%s | Cadinal Exchange" },
  description: "Cadinal Exchange on QMS testnet.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: `try{document.documentElement.dataset.theme=localStorage.getItem('cadinal:theme')==='light'?'light':'dark'}catch{document.documentElement.dataset.theme='dark'}` }} /></head><body><TradingSettingsProvider><WalletProvider>{children}</WalletProvider></TradingSettingsProvider></body></html>;
}
