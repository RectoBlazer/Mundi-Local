import { createFileRoute } from "@tanstack/react-router";
import { FinancePage } from "@/features/finance/FinancePage";

export const Route = createFileRoute("/_app/finance")({
  head: () => ({ meta: [{ title: "Finn — Finance · Mundi" }] }),
  component: FinancePage,
});