import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ActivityFeed } from "@/components/ActivityFeed";
import { Loader2, Sparkles, Check, X, Send, MessageCircle } from "lucide-react";
import { toast } from "sonner";

type TicketStatus = "open" | "replied" | "closed" | string;
type OrderStatus = "pending" | "approved" | "rejected" | "fulfilled" | "confirmed" | string;
type Ticket = {
  id: string;
  channel: "whatsapp" | "shopee" | "telegram";
  customer_handle: string;
  message: string;
  ai_reply: string | null;
  status: TicketStatus;
  created_at: string;
};
type Order = {
  id: string;
  ticket_id: string | null;
  product_name: string;
  qty: number;
  customer_handle: string | null;
  status: OrderStatus;
  notified: boolean;
  created_at: string;
  product_id: string | null;
};

const channelColor = {
  whatsapp: "var(--success)",
  shopee: "var(--warning)",
  telegram: "var(--primary)",
} as const;

export function SupportPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [active, setActive] = useState<Ticket | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [hideHandled, setHideHandled] = useState(true);
  const webhookBase = typeof window !== "undefined" ? window.location.origin : "";

  const load = async () => {
    if (!user) return;
    const [t, o] = await Promise.all([
      supabase
        .from("customer_tickets")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("pending_orders")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setTickets((t.data as Ticket[]) ?? []);
    setOrders((o.data as Order[]) ?? []);
  };

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel("support-rt")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "customer_tickets",
          filter: `user_id=eq.${user.id}`,
        },
        load,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pending_orders", filter: `user_id=eq.${user.id}` },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line
  }, [user]);

  useEffect(() => {
    if (active) setReply(active.ai_reply ?? "");
  }, [active]);

  const askCara = async () => {
    if (!active) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("cara-reply", {
        body: { ticket_id: active.id },
      });
      if (error) throw error;
      if (data?.reply) setReply(data.reply);
      toast.success(
        data?.created_order
          ? "Cara drafted a reply and queued an order for approval."
          : "Cara drafted a reply.",
      );
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Cara failed");
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!active || !user) return;
    await supabase
      .from("customer_tickets")
      .update({ ai_reply: reply, status: "replied" })
      .eq("id", active.id);
    await supabase.from("agent_logs").insert({
      user_id: user.id,
      agent: "cara",
      action: `replied to ${active.customer_handle} on ${active.channel}`,
      status: "success",
    });
    toast.success("Reply saved");
    load();
  };

  const decide = async (id: string, status: "approved" | "rejected") => {
    if (!user) return;
    const order = orders.find((o) => o.id === id);
    await supabase.from("pending_orders").update({ status }).eq("id", id);
    if (status === "approved" && order?.product_id) {
      const { data: prod } = await supabase
        .from("product_catalog")
        .select("stock")
        .eq("id", order.product_id)
        .single();
      if (prod) {
        await supabase
          .from("product_catalog")
          .update({ stock: Math.max(0, (prod.stock ?? 0) - order.qty) })
          .eq("id", order.product_id);
      }
      await supabase.from("agent_logs").insert({
        user_id: user.id,
        agent: "cara",
        action: `approved order · ${order?.product_name} ×${order?.qty} · stock decremented`,
        status: "success",
      });
    } else {
      await supabase.from("agent_logs").insert({
        user_id: user.id,
        agent: "cara",
        action: `rejected order · ${order?.product_name}`,
        status: "warning",
      });
    }
    load();
  };

  const pendingOrders = orders.filter((o) => o.status === "pending");
  const nonPendingOrders = orders.filter((o) => o.status !== "pending");
  const ticketIdsWithPendingApproval = new Set(
    pendingOrders.map((o) => o.ticket_id).filter(Boolean),
  );
  const isHandledTicket = (ticket: Ticket) =>
    ticket.status === "replied" && !ticketIdsWithPendingApproval.has(ticket.id);
  const visibleTickets = hideHandled ? tickets.filter((t) => !isHandledTicket(t)) : tickets;
  const formatStatus = (status: string) => status.replace(/_/g, " ");

  return (
    <div className="max-w-7xl mx-auto px-8 py-10">
      <div className="mb-8 fade-up">
        <div
          className="text-xs font-mono uppercase tracking-widest"
          style={{ color: "var(--cara)" }}
        >
          Agent · Cara
        </div>
        <h1 className="text-3xl font-semibold tracking-tight mt-2">Support</h1>
        <p className="text-muted-foreground mt-1">
          Unified inbox. Cara drafts replies and queues orders for your approval.
        </p>
      </div>

      {pendingOrders.length > 0 && (
        <section
          className="surface-elevated rounded-xl border p-5 mb-6 fade-up"
          style={{ borderColor: "color-mix(in oklab, var(--primary) 40%, var(--border))" }}
        >
          <h2 className="text-sm font-semibold tracking-tight mb-3">Pending approvals</h2>
          <ul className="space-y-2">
            {pendingOrders.map((o) => (
              <li key={o.id} className="rounded-lg p-3 bg-surface-2 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">
                    {o.product_name}{" "}
                    <span className="text-muted-foreground font-mono">×{o.qty}</span>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono mt-0.5">
                    from {o.customer_handle ?? "unknown"}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => decide(o.id, "rejected")}
                  className="gap-1"
                >
                  <X className="w-4 h-4" /> Reject
                </Button>
                <Button size="sm" onClick={() => decide(o.id, "approved")} className="gap-1">
                  <Check className="w-4 h-4" /> Approve & ship
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {nonPendingOrders.length > 0 && (
        <section className="surface-elevated rounded-xl border p-5 mb-6 fade-up">
          <h2 className="text-sm font-semibold tracking-tight mb-3">Order updates</h2>
          <ul className="space-y-2">
            {nonPendingOrders.map((o) => (
              <li
                key={o.id}
                className="rounded-lg p-3 bg-surface-2 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {o.product_name}{" "}
                    <span className="text-muted-foreground font-mono">×{o.qty}</span>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono mt-0.5">
                    for {o.customer_handle ?? "unknown"}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {o.status === "approved" ? (
                    <Badge className="bg-emerald-600/15 text-emerald-300 border-emerald-500/40">
                      Confirmed
                    </Badge>
                  ) : (
                    <Badge
                      variant={o.status === "rejected" ? "destructive" : "outline"}
                      className="capitalize"
                    >
                      {formatStatus(o.status)}
                    </Badge>
                  )}
                  {o.status === "approved" && (
                    <Badge variant={o.notified ? "secondary" : "outline"}>
                      {o.notified ? "Customer notified" : "Notify pending"}
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid lg:grid-cols-[300px_1fr_280px] gap-6">
        <div className="surface-elevated rounded-xl border p-3 h-fit max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between px-2 py-1.5">
            <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Inbox
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px]"
              onClick={() => setHideHandled((v) => !v)}
            >
              {hideHandled ? "Show handled" : "Hide handled"}
            </Button>
          </div>
          {visibleTickets.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">
              No tickets yet. Connect a channel below.
            </div>
          ) : (
            visibleTickets.map((t) => (
              <button
                key={t.id}
                onClick={() => setActive(t)}
                className={`w-full text-left rounded-lg p-3 transition-colors ${active?.id === t.id ? "bg-surface-3" : "hover:bg-surface-2"}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: channelColor[t.channel] }}
                  />
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    {t.channel}
                  </span>
                  {isHandledTicket(t) && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      Handled
                    </Badge>
                  )}
                  <span className="text-xs ml-auto text-muted-foreground font-mono capitalize">
                    {formatStatus(t.status)}
                  </span>
                </div>
                <div className="text-sm font-medium truncate">{t.customer_handle}</div>
                <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{t.message}</div>
              </button>
            ))
          )}
        </div>

        <div className="surface-elevated rounded-xl border p-5 min-h-[400px]">
          {active ? (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  {active.channel} · {active.customer_handle}
                </div>
                <div className="rounded-lg bg-surface-2 p-4 mt-2 text-sm">{active.message}</div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    Your reply
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={askCara}
                    disabled={busy}
                    className="gap-2"
                  >
                    {busy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}{" "}
                    Ask Cara
                  </Button>
                </div>
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={6}
                  placeholder="Cara's draft will appear here…"
                />
                <div className="flex justify-end mt-3">
                  <Button onClick={sendReply} className="gap-2" disabled={!reply.trim()}>
                    <Send className="w-4 h-4" /> Save reply
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              <MessageCircle className="w-5 h-5 mr-2" /> Select a ticket
            </div>
          )}

          <div className="mt-6 pt-5 border-t border-border">
            <h3 className="text-sm font-semibold tracking-tight mb-2">Channel webhooks</h3>
            <p className="text-xs text-muted-foreground mb-2">
              Point external channels at these URLs to feed the inbox.
            </p>
            <div className="space-y-1 font-mono text-xs">
              <div className="rounded-md bg-surface-2 p-2 break-all">
                <span className="text-muted-foreground">POST </span>
                {webhookBase}/api/public/cara/inbound
              </div>
            </div>
          </div>
        </div>

        <aside className="surface-elevated rounded-xl border p-4 h-fit">
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">
            Cara's activity
          </div>
          <ActivityFeed agent="cara" limit={10} />
        </aside>
      </div>
    </div>
  );
}
