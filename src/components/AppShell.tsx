import { Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Sparkles, LayoutDashboard, LineChart, Megaphone, MessagesSquare, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/finance", label: "Finance", icon: LineChart, agent: "Finn", color: "var(--finn)" },
  { to: "/marketing", label: "Marketing", icon: Megaphone, agent: "Mira", color: "var(--mira)" },
  { to: "/support", label: "Support", icon: MessagesSquare, agent: "Cara", color: "var(--cara)" },
] as const;

export function AppShell() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex w-full">
      <aside className="w-60 shrink-0 border-r border-border bg-sidebar flex flex-col">
        <div className="p-5 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">Mundi</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">control</div>
          </div>
        </div>
        <nav className="px-3 py-2 flex-1 space-y-1">
          {nav.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="flex-1">{item.label}</span>
                {"agent" in item && item.agent && (
                  <span
                    className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
                    style={{ color: item.color, background: `color-mix(in oklab, ${item.color} 14%, transparent)` }}
                  >
                    {item.agent}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="px-3 py-2 text-xs text-muted-foreground font-mono truncate">{user.email}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={async () => { await signOut(); navigate({ to: "/auth" }); }}>
            <LogOut className="w-4 h-4" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}