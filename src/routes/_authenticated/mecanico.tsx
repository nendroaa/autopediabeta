import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePerfil } from "@/lib/perfil";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EstadoBadge } from "@/components/EstadoBadge";

export const Route = createFileRoute("/_authenticated/mecanico")({
  head: () => ({ meta: [{ title: "Panel mecánico — AutoPedia" }, { name: "description", content: "Responde consultas de conductores y revisa tus diagnósticos en AutoPedia." }, { property: "og:title", content: "Panel mecánico — AutoPedia" }, { property: "og:description", content: "Responde consultas de conductores y revisa tus diagnósticos en AutoPedia." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: PanelMecanico,
});

const sel = "h-10 w-full rounded-md border bg-card px-3 text-sm";

function PanelMecanico() {
  const { data: perfil, isLoading } = usePerfil();
  if (isLoading) return <p className="text-muted-foreground">Cargando…</p>;
  if (perfil?.rol !== "mecanico") return <p className="text-muted-foreground">Esta sección es solo para mecánicos.</p>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{perfil.nombre_taller}</h1>
        <p className="text-sm text-muted-foreground">{perfil.ciudad}</p>
      </div>
      {!perfil.verificado ? (
        <div className="flex gap-3 rounded-xl border border-warning bg-warning/20 p-4">
          <Clock className="h-5 w-5 shrink-0 text-warning-foreground" />
          <div>
            <p className="font-semibold text-warning-foreground">Tu taller está en proceso de verificación</p>
            <p className="text-sm text-muted-foreground">Cuando te verifiquemos podrás ver y responder consultas.</p>
          </div>
        </div>
      ) : (
        <Tabs defaultValue="abiertas">
          <TabsList className="w-full">
            <TabsTrigger value="abiertas" className="flex-1">Publicaciones abiertas</TabsTrigger>
            <TabsTrigger value="mias" className="flex-1">Mis respuestas</TabsTrigger>
          </TabsList>
          <TabsContent value="abiertas"><Abiertas mecanicoId={perfil.id} /></TabsContent>
          <TabsContent value="mias"><MisRespuestas mecanicoId={perfil.id} /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function Abiertas({ mecanicoId }: { mecanicoId: string }) {
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const { data: pubs } = useQuery({
    queryKey: ["abiertas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("publicaciones")
        .select("*").in("estado", ["publicada", "respondida"]).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const { data: mias } = useMisRespuestas(mecanicoId);
  const respondidas = new Set((mias ?? []).map((r) => r.publicacion_id));
  const marcas = useMemo(() => [...new Set((pubs ?? []).map((p) => p.marca))].sort(), [pubs]);
  const modelos = useMemo(() => [...new Set((pubs ?? []).filter((p) => !marca || p.marca === marca).map((p) => p.modelo))].sort(), [pubs, marca]);
  const lista = (pubs ?? []).filter((p) => (!marca || p.marca === marca) && (!modelo || p.modelo === modelo));

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <select className={sel} value={marca} onChange={(e) => { setMarca(e.target.value); setModelo(""); }}>
          <option value="">Todas las marcas</option>
          {marcas.map((m) => <option key={m}>{m}</option>)}
        </select>
        <select className={sel} value={modelo} onChange={(e) => setModelo(e.target.value)}>
          <option value="">Todos los modelos</option>
          {modelos.map((m) => <option key={m}>{m}</option>)}
        </select>
      </div>
      {lista.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No hay publicaciones abiertas.</p>}
      <ul className="space-y-3">
        {lista.map((p) => <PubAbierta key={p.id} p={p} yaRespondi={respondidas.has(p.id)} />)}
      </ul>
    </div>
  );
}

function PubAbierta({ p, yaRespondi }: { p: { id: string; marca: string; modelo: string; anio: number; sintoma: string; descripcion: string; estado: string }; yaRespondi: boolean }) {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function responder() {
    if (texto.trim().length < 10) { toast.error("Escribe un diagnóstico un poco más detallado"); return; }
    setEnviando(true);
    const { error } = await supabase.from("respuestas").insert({ publicacion_id: p.id, diagnostico: texto.trim() });
    setEnviando(false);
    if (error) { toast.error("No se pudo enviar: " + error.message); return; }
    toast.success("Diagnóstico enviado");
    setTexto(""); setAbierto(false);
    qc.invalidateQueries({ queryKey: ["abiertas"] });
    qc.invalidateQueries({ queryKey: ["mis-respuestas"] });
  }

  return (
    <li className="rounded-xl border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <EstadoBadge estado={p.estado} />
        <span className="text-xs text-muted-foreground">{p.marca} {p.modelo} {p.anio}</span>
      </div>
      <p className="mt-1 font-semibold">{p.sintoma}</p>
      {p.descripcion && <p className="mt-1 text-sm text-muted-foreground">{p.descripcion}</p>}
      {yaRespondi ? (
        <p className="mt-3 text-sm font-semibold text-success">Ya respondiste esta consulta</p>
      ) : abierto ? (
        <div className="mt-3 space-y-2">
          <Textarea rows={4} placeholder="Tu diagnóstico…" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <div className="flex gap-2">
            <Button variant="accent" size="sm" onClick={responder} disabled={enviando}>{enviando ? "Enviando…" : "Enviar diagnóstico"}</Button>
            <Button variant="ghost" size="sm" onClick={() => setAbierto(false)}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="mt-3" onClick={() => setAbierto(true)}>Responder</Button>
      )}
    </li>
  );
}

function useMisRespuestas(mecanicoId: string) {
  return useQuery({
    queryKey: ["mis-respuestas", mecanicoId],
    queryFn: async () => {
      const { data, error } = await supabase.from("respuestas")
        .select("id, publicacion_id, diagnostico, created_at, publicaciones(marca, modelo, anio, sintoma), transacciones(estado)")
        .eq("mecanico_id", mecanicoId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function MisRespuestas({ mecanicoId }: { mecanicoId: string }) {
  const { data } = useMisRespuestas(mecanicoId);
  if (data?.length === 0) return <p className="mt-4 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Aún no has respondido consultas.</p>;
  return (
    <ul className="mt-4 space-y-3">
      {data?.map((r) => {
        const estado = (r.transacciones as { estado: string }[])[0]?.estado ?? "respondida";
        const p = r.publicaciones as { marca: string; modelo: string; anio: number; sintoma: string } | null;
        return (
          <li key={r.id} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <EstadoBadge estado={estado} />
              {p && <span className="text-xs text-muted-foreground">{p.marca} {p.modelo} {p.anio}</span>}
            </div>
            {p && <p className="mt-1 font-semibold">{p.sintoma}</p>}
            <p className="mt-1 text-sm text-muted-foreground">{r.diagnostico}</p>
          </li>
        );
      })}
    </ul>
  );
}
