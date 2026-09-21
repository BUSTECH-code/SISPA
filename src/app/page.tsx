import { StockProvider } from "@/context/StockContext";
import { MainApp } from "@/components/MainApp";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <StockProvider>
      <MainApp />
    </StockProvider>
  );
}
