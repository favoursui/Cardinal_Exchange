import type { Metadata } from "next";
import { Navbar } from "@/components/layout/navbar";
import { LiquidityPageContent } from "@/features/liquidity/liquidity-page";
export const metadata: Metadata = { title: "Liquidity" };
export default function LiquidityPage() { return <><Navbar/><main id="main-content" className="min-h-[calc(100dvh-84px)] bg-background"><LiquidityPageContent/></main></>; }
