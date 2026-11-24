import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/AppHeader";

export const Route = createFileRoute("/panel")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/" });
    const { data: esAdmin } = await supabase.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
    if (!esAdmin) throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "Panel interno — AutoPedia" }, { name: "description", content: "Métricas internas de AutoPedia." }, { property: "og:title", content: "Panel interno — AutoPedia" }, { property: "og:description", content: "Métricas internas de AutoPedia." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: PanelAdmin,
});

const TIPOS = [
  { k: "registro", l: "Registros" },
  { k: "activacion", l: "Activaciones" },
  { k: "transaccion_completada", l: "Transacciones completadas" },
  { k: "clic_cta_comercial", l: "Clics en “Destacar mi taller”" },
] as const;
const TIPO_LABEL: Record<string, string> = { registro: "Registro", activacion: "Activación", transaccion_completada: "Transacción completada", clic_cta_comercial: "Clic “Destacar mi taller”" };
const fmt = (d: string) => new Date(d).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
const clp = (n: number) => n.toLocaleString("es-CL", { style: "currency", currency: "CLP" });

function useDatos() {
  return useQuery({
    queryKey: ["panel-admin"],
    queryFn: async () => {
      const conteo = (t: string) => supabase.from("eventos").select("id", { count: "exact", head: true }).eq("tipo", t);
      const [c0, c1, c2, c3, ev, tx, ab, cf] = await Promise.all([
        conteo("registro"), conteo("activacion"), conteo("transaccion_completada"), conteo("clic_cta_comercial"),
        supabase.from("eventos").select("id,tipo,fecha").order("fecha", { ascending: false }).limit(10),
        supabase.from("transacciones").select("id,created_at,pagador,precio,comision,estado").order("created_at", { ascending: false }).limit(10),
        supabase.from("publicaciones").select("id", { count: "exact", head: true }).in("estado", ["publicada", "respondida"]),
        supabase.from("publicaciones").select("id", { count: "exact", head: true }).eq("estado", "confirmada"),
      ]);
      const err = [c0, c1, c2, c3, ev, tx, ab, cf].find((r) => r.error)?.error;
      if (err) throw err;
      return {
        totales: [c0.count ?? 0, c1.count ?? 0, c2.count ?? 0, c3.count ?? 0],
        eventos: ev.data ?? [], transacciones: tx.data ?? [],
        abiertos: ab.count ?? 0, confirmados: cf.count ?? 0,
      };
    },
  });
}

function PanelAdmin() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useDatos();
  const [enVivo, setEnVivo] = useState(false);

  useEffect(() => {
    const ch = supabase
      .channel(`panel-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "eventos" }, () => qc.invalidateQueries({ queryKey: ["panel-admin"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "transacciones" }, () => qc.invalidateQueries({ queryKey: ["panel-admin"] }))
      .subscribe((s) => setEnVivo(s === "SUBSCRIBED"));
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const card = "rounded-xl border bg-card p-5 shadow-card";
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3"><Logo /><span className="text-sm text-muted-foreground">Panel interno</span></div>
          <span className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${enVivo ? "text-foreground" : "text-muted-foreground"}`}>
            <span className={`h-2 w-2 rounded-full ${enVivo ? "bg-accent animate-pulse" : "bg-muted-foreground"}`} />
            {enVivo ? "En vivo" : "Conectando…"}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {isLoading && <p className="text-muted-foreground">Cargando…</p>}
        {error && <p className="text-destructive">No se pudieron cargar los datos.</p>}
        {data && (<>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TIPOS.map((t, i) => (
              <div key={t.k} className={card}>
                <p className="text-sm text-muted-foreground">{t.l}</p>
                <p className="mt-2 font-display text-3xl font-bold">{data.totales[i]}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <div className={`${card} lg:col-span-2`}>
              <h2 className="mb-4 font-semibold">Embudo</h2>
              <ol className="space-y-3">
                {TIPOS.map((t, i) => {
                  const v = data.totales[i] ?? 0; const max = Math.max(data.totales[0] ?? 0, 1);
                  const prev = i > 0 ? (data.totales[i - 1] ?? 0) : null;
                  const pct = prev === null ? null : prev > 0 ? Math.round((v / prev) * 100) : 0;
                  return (
                    <li key={t.k}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>{i + 1}. {t.l}</span>
                        <span className="text-muted-foreground">{v}{pct !== null && ` · ${pct}% del paso anterior`}</span>
                      </div>
                      <div className="h-3 rounded-full bg-secondary">
                        <div className="h-3 rounded-full bg-accent" style={{ width: `${Math.min(100, (v / max) * 100)}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
            <div className={card}>
              <h2 className="mb-4 font-semibold">Casos</h2>
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-sm text-muted-foreground">Abiertos</p><p className="font-display text-3xl font-bold">{data.abiertos}</p></div>
                <div><p className="text-sm text-muted-foreground">Con solución confirmada</p><p className="font-display text-3xl font-bold">{data.confirmados}</p></div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <div className={`${card} lg:col-span-2 overflow-x-auto`}>
              <h2 className="mb-4 font-semibold">Últimas transacciones</h2>
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground"><tr><th className="pb-2">Fecha</th><th>Pagador</th><th>Precio</th><th>Comisión</th><th>Estado</th></tr></thead>
                <tbody>
                  {data.transacciones.map((t) => (
                    <tr key={t.id} className="border-t"><td className="py-2">{fmt(t.created_at)}</td><td>{t.pagador}</td><td>{clp(t.precio)}</td><td>{clp(t.comision)}</td><td className="capitalize">{t.estado}</td></tr>
                  ))}
                  {data.transacciones.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Sin transacciones aún.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className={card}>
              <h2 className="mb-4 font-semibold">Últimos 10 eventos</h2>
              <ul className="space-y-2 text-sm">
                {data.eventos.map((e) => (
                  <li key={e.id} className="flex justify-between gap-2 border-b pb-2 last:border-0"><span>{TIPO_LABEL[e.tipo] ?? e.tipo}</span><span className="text-muted-foreground">{fmt(e.fecha)}</span></li>
                ))}
                {data.eventos.length === 0 && <li className="text-muted-foreground">Sin eventos aún.</li>}
              </ul>
            </div>
          </section>
        </>)}
      </main>
    </div>
  );
}
