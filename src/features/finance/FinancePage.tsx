import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ActivityFeed } from "@/components/ActivityFeed";
import { Upload, Loader2, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, Legend } from "recharts";

type Summary = {
  cash_flow_health: { score: number; label: string; commentary: string };
  totals: { earnings: number; expenses: number; net: number; currency: string };
  waste_detection: Array<{ category: string; amount: number; reason: string }>;
  action_plan: Array<{ title: string; impact: string; effort: string }>;
  history?: Array<{ date: string; earnings: number; expenses: number; net: number }>;
  forecast?: Array<{ date: string; projected_net: number; projected_earnings: number; projected_expenses: number }>;
};

type Run = {
  id: string;
  file_name: string;
  type: "expense" | "earning" | "inventory";
  summary: Summary | null;
  created_at: string;
};

export function FinancePage() {
  const { user } = useAuth();
  const [runs, setRuns] = useState<Run[]>([]);
  const [active, setActive] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("business_data")
      .select("id, file_name, type, summary, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    const list = (data as Run[]) ?? [];
    setRuns(list);
    if (list.length && !active) setActive(list[0]);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  const onUpload = async (file: File) => {
    if (!user) return;
    setBusy(true);
    try {
      const text = await file.text();
      toast.info("Finn is parsing your file…");
      const { data, error } = await supabase.functions.invoke("finn-analyze", {
        body: { csv: text, file_name: file.name },
      });
      if (error) throw error;
      toast.success("Analysis ready");
      await load();
      if (data?.id) {
        const { data: row } = await supabase.from("business_data").select("id, file_name, type, summary, created_at").eq("id", data.id).single();
        if (row) setActive(row as Run);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to analyze";
      toast.error(msg);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const summary = active?.summary;

  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <div className="flex items-start justify-between mb-8 fade-up">
        <div>
          <div className="text-xs font-mono uppercase tracking-widest" style={{ color: "var(--finn)" }}>Agent · Finn</div>
          <h1 className="text-3xl font-semibold tracking-tight mt-2">Finance</h1>
          <p className="text-muted-foreground mt-1">Upload a CSV. Finn detects waste and writes an action plan.</p>
        </div>
        <div>
          <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
          <Button onClick={() => inputRef.current?.click()} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {busy ? "Analyzing…" : "Upload CSV"}
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_280px] gap-6">
        <div className="space-y-4">
          {!summary ? (
            <div className="surface-elevated rounded-xl border p-12 text-center">
              <div className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center mb-4" style={{ background: "color-mix(in oklab, var(--finn) 16%, transparent)", color: "var(--finn)" }}>
                <Upload className="w-5 h-5" />
              </div>
              <h3 className="font-semibold tracking-tight">No analyses yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">Drop a CSV with columns like <span className="font-mono">date, category, amount</span> to begin.</p>
            </div>
          ) : (
            <>
              <div className="surface-elevated rounded-xl border p-6 fade-up">
                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Cash Flow Health</div>
                    <div className="text-3xl font-semibold tracking-tight mt-2">{summary.cash_flow_health.label}</div>
                  </div>
                  <div className="text-5xl font-semibold tracking-tighter font-mono" style={{ color: summary.cash_flow_health.score >= 70 ? "var(--success)" : summary.cash_flow_health.score >= 40 ? "var(--warning)" : "var(--destructive)" }}>
                    {summary.cash_flow_health.score}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-3 text-balance">{summary.cash_flow_health.commentary}</p>
                <div className="grid grid-cols-3 gap-3 mt-6">
                  <div className="rounded-lg p-3 bg-surface-2"><div className="text-[10px] font-mono uppercase text-muted-foreground">Earnings</div><div className="text-lg font-semibold mt-1 flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" style={{ color: "var(--success)" }} />{summary.totals.currency} {summary.totals.earnings.toLocaleString()}</div></div>
                  <div className="rounded-lg p-3 bg-surface-2"><div className="text-[10px] font-mono uppercase text-muted-foreground">Expenses</div><div className="text-lg font-semibold mt-1 flex items-center gap-1"><TrendingDown className="w-3.5 h-3.5" style={{ color: "var(--destructive)" }} />{summary.totals.currency} {summary.totals.expenses.toLocaleString()}</div></div>
                  <div className="rounded-lg p-3 bg-surface-2"><div className="text-[10px] font-mono uppercase text-muted-foreground">Net</div><div className="text-lg font-semibold mt-1">{summary.totals.currency} {summary.totals.net.toLocaleString()}</div></div>
                </div>
              </div>

              {(summary.history?.length || summary.forecast?.length) ? (
                <div className="surface-elevated rounded-xl border p-6 fade-up">
                  <div className="flex items-baseline justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-semibold tracking-tight">Cash Flow · 30-day Forecast</h3>
                      <p className="text-xs text-muted-foreground mt-1">History (solid) and Finn's projection (dashed) for the next 30 days.</p>
                    </div>
                    <div className="text-[10px] font-mono uppercase text-muted-foreground">{summary.totals.currency}</div>
                  </div>
                  {(() => {
                    const hist = (summary.history ?? []).map((h) => ({ date: h.date, net: h.net, projected: null as number | null }));
                    const fc = (summary.forecast ?? []).map((f) => ({ date: f.date, net: null as number | null, projected: f.projected_net }));
                    const data = [...hist, ...fc];
                    const splitDate = hist.length ? hist[hist.length - 1].date : undefined;
                    return (
                      <ChartContainer
                        config={{
                          net: { label: "Net (history)", color: "var(--finn)" },
                          projected: { label: "Projected net", color: "var(--warning)" },
                        }}
                        className="h-64 w-full"
                      >
                        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="date" tickFormatter={(d) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" })} minTickGap={24} />
                          <YAxis tickFormatter={(v) => Number(v).toLocaleString()} width={64} />
                          <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                          <Legend />
                          {splitDate ? <ReferenceLine x={splitDate} stroke="var(--muted-foreground)" strokeDasharray="2 4" label={{ value: "today", position: "top", fontSize: 10 }} /> : null}
                          <Line type="monotone" dataKey="net" stroke="var(--color-net)" strokeWidth={2} dot={false} connectNulls />
                          <Line type="monotone" dataKey="projected" stroke="var(--color-projected)" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
                        </LineChart>
                      </ChartContainer>
                    );
                  })()}
                </div>
              ) : null}

              <div className="surface-elevated rounded-xl border p-6 fade-up">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-4 h-4" style={{ color: "var(--warning)" }} />
                  <h3 className="text-sm font-semibold tracking-tight">Waste Detection</h3>
                </div>
                {summary.waste_detection.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No significant waste detected.</p>
                ) : (
                  <ul className="space-y-2">
                    {summary.waste_detection.map((w, i) => (
                      <li key={i} className="rounded-lg p-3 bg-surface-2 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{w.category}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{w.reason}</div>
                        </div>
                        <div className="font-mono text-sm shrink-0" style={{ color: "var(--warning)" }}>{summary.totals.currency} {w.amount.toLocaleString()}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="surface-elevated rounded-xl border p-6 fade-up">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle2 className="w-4 h-4" style={{ color: "var(--finn)" }} />
                  <h3 className="text-sm font-semibold tracking-tight">Action Plan</h3>
                </div>
                <ol className="space-y-2">
                  {summary.action_plan.map((a, i) => (
                    <li key={i} className="rounded-lg p-3 bg-surface-2">
                      <div className="flex items-baseline gap-3">
                        <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                        <div className="flex-1">
                          <div className="text-sm font-medium">{a.title}</div>
                          <div className="text-xs text-muted-foreground mt-1 flex gap-3 font-mono uppercase tracking-wider">
                            <span>Impact · <span style={{ color: "var(--success)" }}>{a.impact}</span></span>
                            <span>Effort · {a.effort}</span>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}
        </div>

        <aside className="space-y-4">
          <div className="surface-elevated rounded-xl border p-4">
            <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">Recent runs</div>
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No runs yet.</p>
            ) : (
              <ul className="space-y-1">
                {runs.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => setActive(r)}
                      className={`w-full text-left rounded-lg p-2 text-sm transition-colors ${active?.id === r.id ? "bg-surface-3" : "hover:bg-surface-2"}`}
                    >
                      <div className="truncate font-medium">{r.file_name}</div>
                      <div className="text-[10px] font-mono text-muted-foreground mt-0.5 uppercase">{r.type} · {new Date(r.created_at).toLocaleDateString()}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="surface-elevated rounded-xl border p-4">
            <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">Finn's activity</div>
            <ActivityFeed agent="finn" limit={6} />
          </div>
        </aside>
      </div>
    </div>
  );
}