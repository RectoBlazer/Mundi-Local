import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDistanceToNow } from "date-fns";

type Log = {
  id: string;
  agent: "finn" | "mira" | "cara";
  action: string;
  status: string;
  created_at: string;
};

const agentMeta = {
  finn: { name: "Finn", color: "var(--finn)" },
  mira: { name: "Mira", color: "var(--mira)" },
  cara: { name: "Cara", color: "var(--cara)" },
} as const;

export function ActivityFeed({ limit = 12, agent }: { limit?: number; agent?: "finn" | "mira" | "cara" }) {
  const { user } = useAuth();
  const [logs, setLogs] = useState<Log[]>([]);

  useEffect(() => {
    if (!user) return;
    let q = supabase.from("agent_logs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(limit);
    if (agent) q = q.eq("agent", agent);
    q.then(({ data }) => setLogs((data as Log[]) ?? []));

    const ch = supabase
      .channel("agent_logs_feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_logs", filter: `user_id=eq.${user.id}` }, (payload) => {
        const row = payload.new as Log;
        if (agent && row.agent !== agent) return;
        setLogs((prev) => [row, ...prev].slice(0, limit));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, limit, agent]);

  if (logs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center font-mono">
        No activity yet. Agents will report here in real time.
      </div>
    );
  }

  return (
    <ul className="space-y-1">
      {logs.map((log) => {
        const meta = agentMeta[log.agent];
        return (
          <li key={log.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-2 transition-colors fade-up">
            <div className="mt-1.5 w-1.5 h-1.5 rounded-full pulse-dot shrink-0" style={{ background: meta.color, boxShadow: `0 0 12px ${meta.color}` }} />
            <div className="flex-1 min-w-0">
              <div className="text-sm leading-snug">
                <span className="font-medium" style={{ color: meta.color }}>{meta.name}</span>{" "}
                <span className="text-foreground/85">{log.action}</span>
              </div>
              <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
                {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}