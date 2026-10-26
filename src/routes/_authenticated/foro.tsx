import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CheckCircle2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/foro")({
  head: () => ({ meta: [{ title: "Buscador del foro — AutoPedia" }, { name: "description", content: "Busca soluciones confirmadas por marca, modelo, año y síntoma en AutoPedia." }, { property: "og:title", content: "Buscador del foro — AutoPedia" }, { property: "og:description", content: "Busca soluciones confirmadas por marca, modelo, año y síntoma en AutoPedia." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: Foro,
});

const sel = "h-11 w-full rounded-md border bg-card px-3 text-sm disabled:opacity-50";

function Foro() {
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [anio, setAnio] = useState("");
  const [sintoma, setSintoma] = useState("");

  const { data: pubs, isLoading } = useQuery({
    queryKey: ["foro"],
    queryFn: async () => {
      const { data, error } = await supabase.from("publicaciones")
        .select("id, marca, modelo, anio, sintoma, descripcion, respuestas(id, diagnostico)")
        .eq("estado", "confirmada").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const todas = pubs ?? [];
  const uniq = <T,>(a: T[]) => [...new Set(a)].sort();
  const marcas = useMemo(() => uniq(todas.map((p) => p.marca)), [todas]);
  const modelos = uniq(todas.filter((p) => p.marca === marca).map((p) => p.modelo));
  const anios = uniq(todas.filter((p) => p.marca === marca && p.modelo === modelo).map((p) => String(p.anio)));
  const sintomas = uniq(todas.filter((p) => p.marca === marca && p.modelo === modelo && String(p.anio) === anio).map((p) => p.sintoma));

  const lista = todas.filter((p) =>
    (!marca || p.marca === marca) && (!modelo || p.modelo === modelo) &&
    (!anio || String(p.anio) === anio) && (!sintoma || p.sintoma === sintoma));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Buscador del foro</h1>
        <p className="text-sm text-muted-foreground">Solo soluciones confirmadas por conductores.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 rounded-xl border bg-card p-3 shadow-card sm:grid-cols-4">
        <select className={sel} value={marca} onChange={(e) => { setMarca(e.target.value); setModelo(""); setAnio(""); setSintoma(""); }}>
          <option value="">Marca</option>{marcas.map((m) => <option key={m}>{m}</option>)}
        </select>
        <select className={sel} disabled={!marca} value={modelo} onChange={(e) => { setModelo(e.target.value); setAnio(""); setSintoma(""); }}>
          <option value="">Modelo</option>{modelos.map((m) => <option key={m}>{m}</option>)}
        </select>
        <select className={sel} disabled={!modelo} value={anio} onChange={(e) => { setAnio(e.target.value); setSintoma(""); }}>
          <option value="">Año</option>{anios.map((m) => <option key={m}>{m}</option>)}
        </select>
        <select className={sel} disabled={!anio} value={sintoma} onChange={(e) => setSintoma(e.target.value)}>
          <option value="">Síntoma</option>{sintomas.map((m) => <option key={m}>{m}</option>)}
        </select>
      </div>
      {isLoading && <p className="text-muted-foreground">Cargando…</p>}
      {!isLoading && lista.length === 0 && (
        <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          <Search className="h-4 w-4" /> Sin resultados para esa búsqueda.
        </p>
      )}
      <ul className="space-y-3">
        {lista.map((p) => (
          <li key={p.id} className="rounded-xl border bg-card p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{p.marca} {p.modelo} · {p.anio}</p>
            <h3 className="mt-1 font-bold">{p.sintoma}</h3>
            {p.descripcion && <p className="mt-1 text-sm text-muted-foreground">{p.descripcion}</p>}
            {(p.respuestas as { id: string; diagnostico: string }[]).map((r) => (
              <div key={r.id} className="mt-3 rounded-lg bg-success/10 p-3">
                <p className="mb-1 inline-flex items-center gap-1 text-xs font-bold text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Solución confirmada
                </p>
                <p className="text-sm">{r.diagnostico}</p>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
