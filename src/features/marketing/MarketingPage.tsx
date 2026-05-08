import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ActivityFeed } from "@/components/ActivityFeed";
import { Loader2, Plus, Sparkles, ImageIcon, Instagram, Webhook, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Product = { id: string; name: string; description: string | null; price: number | null; stock: number; image_url: string | null };
type GenResult = { platform: string; caption: string; hashtags: string[]; image_url: string | null }[];

export function MarketingPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [busy, setBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [results, setResults] = useState<GenResult>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const webhookBase = typeof window !== "undefined" ? window.location.origin : "";

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("product_catalog").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    const list = (data as Product[]) ?? [];
    setProducts(list);
    if (list.length && !selected) setSelected(list[0]);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  const uploadImage = async (file: File) => {
    if (!user) return;
    const path = `${user.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("product-images").upload(path, file);
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    setImageUrl(data.publicUrl);
  };

  const createProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("product_catalog").insert({
      user_id: user.id, name, description: desc || null,
      price: price ? Number(price) : 0, stock: stock ? Number(stock) : 0, image_url: imageUrl,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Product added");
    setName(""); setDesc(""); setPrice(""); setStock(""); setImageUrl(null); setShowAdd(false);
    load();
  };

  const generate = async () => {
    if (!selected) return;
    setGenBusy(true);
    setResults([]);
    try {
      const { data, error } = await supabase.functions.invoke("mira-generate", { body: { product_id: selected.id } });
      if (error) throw error;
      setResults(data?.posts ?? []);
      toast.success("Captions ready");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenBusy(false);
    }
  };

  const removeProduct = async (p: Product) => {
    if (!user) return;
    if (!confirm(`Remove "${p.name}"? This also deletes its drafted posts.`)) return;
    const { error } = await supabase.from("product_catalog").delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Product removed");
    if (selected?.id === p.id) { setSelected(null); setResults([]); }
    load();
  };

  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <div className="flex items-start justify-between mb-8 fade-up">
        <div>
          <div className="text-xs font-mono uppercase tracking-widest" style={{ color: "var(--mira)" }}>Agent · Mira</div>
          <h1 className="text-3xl font-semibold tracking-tight mt-2">Marketing</h1>
          <p className="text-muted-foreground mt-1">Pick a product. Mira reads the photo and writes the post.</p>
        </div>
        <Button onClick={() => setShowAdd((v) => !v)} variant="outline" className="gap-2"><Plus className="w-4 h-4" /> Product</Button>
      </div>

      {showAdd && (
        <form onSubmit={createProduct} className="surface-elevated rounded-xl border p-5 mb-6 grid md:grid-cols-2 gap-4 fade-up">
          <div className="space-y-2"><Label>Name</Label><Input required value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-2"><Label>Price</Label><Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          <div className="space-y-2 md:col-span-2"><Label>Description</Label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} /></div>
          <div className="space-y-2"><Label>Stock</Label><Input type="number" value={stock} onChange={(e) => setStock(e.target.value)} /></div>
          <div className="space-y-2"><Label>Image</Label>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} className="w-full gap-2"><ImageIcon className="w-4 h-4" />{imageUrl ? "Replace photo" : "Upload photo"}</Button>
          </div>
          {imageUrl && <img src={imageUrl} alt="Preview" className="md:col-span-2 rounded-lg max-h-40 object-cover" />}
          <div className="md:col-span-2"><Button type="submit" disabled={busy}>Save product</Button></div>
        </form>
      )}

      <div className="grid lg:grid-cols-[260px_1fr_280px] gap-6">
        <div className="surface-elevated rounded-xl border p-3">
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground px-2 py-1.5">Catalog</div>
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground p-3">Add a product to begin.</p>
          ) : (
            <ul className="space-y-1">
              {products.map((p) => (
                <li key={p.id}>
                  <div className={`group w-full rounded-lg p-2 flex items-center gap-3 transition-colors ${selected?.id === p.id ? "bg-surface-3" : "hover:bg-surface-2"}`}>
                    <button onClick={() => { setSelected(p); setResults([]); }} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                      {p.image_url ? <img src={p.image_url} alt="" className="w-10 h-10 rounded-md object-cover" /> : <div className="w-10 h-10 rounded-md bg-surface-3 flex items-center justify-center"><ImageIcon className="w-4 h-4 text-muted-foreground" /></div>}
                      <div className="min-w-0"><div className="text-sm font-medium truncate">{p.name}</div><div className="text-[10px] font-mono text-muted-foreground">stock {p.stock}</div></div>
                    </button>
                    <button onClick={() => removeProduct(p)} aria-label="Remove product" className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-4">
          {selected ? (
            <>
              <div className="surface-elevated rounded-xl border p-5 flex gap-5 fade-up">
                {selected.image_url ? <img src={selected.image_url} alt={selected.name} className="w-32 h-32 rounded-lg object-cover" /> : <div className="w-32 h-32 rounded-lg bg-surface-2 flex items-center justify-center"><ImageIcon className="w-6 h-6 text-muted-foreground" /></div>}
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-semibold tracking-tight">{selected.name}</h2>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{selected.description || "No description yet."}</p>
                  <div className="mt-4">
                    <div className="flex gap-2">
                      <Button onClick={generate} disabled={genBusy} className="gap-2">
                        {genBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {genBusy ? "Mira is generating ads…" : "Generate ad posts"}
                      </Button>
                      <Button onClick={() => removeProduct(selected)} variant="outline" className="gap-2 text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" /> Remove
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {results.length > 0 && (
                <div className="grid md:grid-cols-2 gap-4">
                  {results.map((r, i) => (
                    <div key={i} className="surface-elevated rounded-xl border overflow-hidden fade-up">
                      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                        <Instagram className="w-4 h-4" style={{ color: "var(--mira)" }} />
                        <span className="text-sm font-semibold tracking-tight">{r.platform}</span>
                      </div>
                      {(r.image_url ?? selected.image_url) && <img src={r.image_url ?? selected.image_url!} alt="" className="w-full aspect-square object-cover" />}
                      <div className="p-4">
                        <p className="text-sm whitespace-pre-wrap text-balance">{r.caption}</p>
                        <div className="flex flex-wrap gap-1 mt-3">
                          {r.hashtags.map((h, j) => <span key={j} className="text-xs font-mono text-primary">#{h}</span>)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="surface-elevated rounded-xl border p-5">
                <div className="flex items-center gap-2 mb-3"><Webhook className="w-4 h-4 text-muted-foreground" /><h3 className="text-sm font-semibold tracking-tight">n8n / Make.com webhooks</h3></div>
                <p className="text-sm text-muted-foreground mb-3">Wire your workflows to these endpoints to schedule posts and pull comments.</p>
                <div className="space-y-2 font-mono text-xs">
                  <div className="rounded-md bg-surface-2 p-2 break-all"><span className="text-muted-foreground">POST </span>{webhookBase}/api/public/mira/comments</div>
                  <div className="rounded-md bg-surface-2 p-2 break-all"><span className="text-muted-foreground">GET  </span>{webhookBase}/api/public/mira/posts?user_id={user?.id ?? "<your-id>"}</div>
                </div>
              </div>
            </>
          ) : (
            <div className="surface-elevated rounded-xl border p-12 text-center text-sm text-muted-foreground">Select or create a product to get started.</div>
          )}
        </div>

        <aside className="surface-elevated rounded-xl border p-4 h-fit">
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">Mira's activity</div>
          <ActivityFeed agent="mira" limit={8} />
        </aside>
      </div>
    </div>
  );
}