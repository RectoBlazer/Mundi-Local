import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/features/marketing/MarketingPage";

export const Route = createFileRoute("/_app/marketing")({
  head: () => ({ meta: [{ title: "Mira — Marketing · Mundi" }] }),
  component: MarketingPage,
});