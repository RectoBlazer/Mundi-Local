import { createFileRoute } from "@tanstack/react-router";
import { SupportPage } from "@/features/support/SupportPage";

export const Route = createFileRoute("/_app/support")({
  head: () => ({ meta: [{ title: "Cara — Support · Mundi" }] }),
  component: SupportPage,
});