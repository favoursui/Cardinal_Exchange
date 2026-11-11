import { Navbar } from "@/components/layout/navbar";
import { ExchangeCard } from "@/features/swap/exchange-card";

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main id="main-content" aria-label="Cadinal Exchange" className="flex min-h-[calc(100dvh-84px)] items-start justify-center bg-background px-4 pb-12 pt-10 sm:pt-14">
        <ExchangeCard />
      </main>
    </>
  );
}
