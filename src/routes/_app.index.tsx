import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ActivityFeed } from "@/components/ActivityFeed";
import { LineChart, Megaphone, MessagesSquare, TrendingUp, Package, Bell } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/")({
  head: () => ({ meta: [{ title: "Dashboard — Mundi" }] }),
  component: Dashboard,
});

function StatCard({ label, value, hint, icon: Icon, color }: { label: string; value: string | number; hint?: string; icon: typeof LineChart; color: string }) {
  return (
    <div className="surface-elevated rounded-xl border p-5 fade-up">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold tracking-tight mt-2">{value}</div>
          {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
        </div>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color }}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}

function AgentCard({ name, role, color, to, status }: { name: string; role: string; color: string; to: "/finance" | "/marketing" | "/support"; status: string }) {
  return (
    <Link to={to} className="group surface-elevated rounded-xl border p-5 hover:border-primary/40 transition-colors fade-up block">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full pulse-dot" style={{ background: color, boxShadow: `0 0 12px ${color}` }} />
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Agent</div>
      </div>
      <div className="mt-3 text-xl font-semibold tracking-tight" style={{ color }}>{name}</div>
      <div className="text-sm text-muted-foreground mt-0.5">{role}</div>
      <div className="mt-4 text-xs font-mono text-foreground/70">{status}</div>
    </Link>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ products: 0, openTickets: 0, pendingOrders: 0, financeRuns: 0 });
  const [biz, setBiz] = useState<string>("your business");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ count: products }, { count: openTickets }, { count: pendingOrders }, { count: financeRuns }, profile] = await Promise.all([
        supabase.from("product_catalog").select("*", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("customer_tickets").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "open"),
        supabase.from("pending_orders").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "pending"),
        supabase.from("business_data").select("*", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("profiles").select("business_name").eq("id", user.id).maybeSingle(),
      ]);
      setStats({ products: products ?? 0, openTickets: openTickets ?? 0, pendingOrders: pendingOrders ?? 0, financeRuns: financeRuns ?? 0 });
      if (profile.data?.business_name) setBiz(profile.data.business_name);
    })();
  }, [user]);

  return (
    <div className="relative">
      <div className="absolute inset-x-0 top-0 h-64 -z-10" style={{ background: "var(--gradient-glow)" }} />
      <div className="max-w-6xl mx-auto px-8 py-10">
        <div className="mb-10 fade-up">
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Mission Control</div>
          <h1 className="text-3xl font-semibold tracking-tight mt-2 text-balance">{biz}</h1>
          <p className="text-muted-foreground mt-1">Three agents working in the background.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <StatCard label="Products" value={stats.products} icon={Package} color="var(--mira)" />
          <StatCard label="Open tickets" value={stats.openTickets} icon={MessagesSquare} color="var(--cara)" />
          <StatCard label="Approvals waiting" value={stats.pendingOrders} icon={Bell} color="var(--primary)" />
          <StatCard label="Finance runs" value={stats.financeRuns} icon={TrendingUp} color="var(--finn)" />
        </div>

        <div className="grid lg:grid-cols-3 gap-3 mb-10">
          <AgentCard name="Finn" role="Finance & cash flow" color="var(--finn)" to="/finance" status="Idle · waiting for CSV" />
          <AgentCard name="Mira" role="Marketing & social" color="var(--mira)" to="/marketing" status="Idle · select a product" />
          <AgentCard name="Cara" role="Customer support" color="var(--cara)" to="/support" status="Listening on inbox" />
        </div>

        <section className="surface-elevated rounded-xl border p-5 fade-up">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Activity Feed</h2>
              <p className="text-xs text-muted-foreground font-mono">Real-time agent actions</p>
            </div>
          </div>
          <ActivityFeed limit={15} />
        </section>
      </div>
    </div>
  );
}