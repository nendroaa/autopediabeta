import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePerfil } from "@/lib/perfil";
import { Button } from "@/components/ui/button";
import { EstadoBadge } from "@/components/EstadoBadge";

export const Route = createFileRoute("/_authenticated/publicacion/$id")({
  head: () => ({ meta: [{ title: "Detalle de publicación — AutoPedia" }, { name: "description", content: "Revisa diagnósticos y confirma la solución de tu publicación en AutoPedia." }, { property: "og:title", content: "Detalle de publicación — AutoPedia" }, { property: "og:description", content: "Revisa diagnósticos y confirma la solución de tu publicación en AutoPedia." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: Detalle,
});

function Detalle() {
  const { id } = Route.useParams();
  const { data: perfil } = usePerfil();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["publicacion", id],
    queryFn: async () => {
      const { data: pub, error } = await supabase.from("publicaciones").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!pub) return null;
      const [{ data: resps }, { data: trans }] = await Promise.all([
        supabase.from("respuestas").select("*").eq("publicacion_id", id).order("created_at"),
        supabase.from("transacciones").select("respuesta_id, estado").eq("publicacion_id", id),
      ]);
      const ids = [...new Set((resps ?? []).map((r) => r.mecanico_id))];
      const { data: mecs } = ids.length
        ? await supabase.from("perfiles").select("id, nombre, nombre_taller, ciudad").in("id", ids)
        : { data: [] };
      return { pub, resps: resps ?? [], trans: trans ?? [], mecs: mecs ?? [] };
    },
  });

  async function confirmar(respuestaId: string) {
    const { error } = await supabase.rpc("confirmar_solucion", { _respuesta_id: respuestaId });
    if (error) { toast.error(error.message); return; }
    toast.success("¡Solución confirmada! Gracias por ayudar a otros conductores.");
    qc.invalidateQueries();
  }

  if (isLoading) return <p className="text-muted-foreground">Cargando…</p>;
  if (!data) return <p className="text-muted-foreground">Publicación no encontrada.</p>;
  const { pub, resps, trans, mecs } = data;
  const esDueno = perfil?.id === pub.conductor_id;
  const confirmadaId = trans.find((t) => t.estado === "confirmada")?.respuesta_id;

  return (
    <div className="space-y-5">
      <Link to={esDueno ? "/conductor" : "/foro"} className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver
      </Link>
      <div className="rounded-xl border bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <EstadoBadge estado={pub.estado} />
          <span className="text-sm text-muted-foreground">{pub.marca} {pub.modelo} · {pub.anio}</span>
        </div>
        <h1 className="mt-2 text-xl font-bold">{pub.sintoma}</h1>
        {pub.descripcion && <p className="mt-2 text-sm text-muted-foreground">{pub.descripcion}</p>}
      </div>

      <h2 className="font-bold">Respuestas ({resps.length})</h2>
      {resps.length === 0 && (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aún no hay respuestas. Un mecánico verificado responderá pronto.
        </p>
      )}
      <ul className="space-y-3">
        {resps.map((r) => {
          const m = mecs.find((x) => x.id === r.mecanico_id);
          const esLaConfirmada = confirmadaId === r.id || (pub.estado === "confirmada" && resps.length === 1);
          return (
            <li key={r.id} className={`rounded-xl border bg-card p-4 ${esLaConfirmada ? "border-success" : ""}`}>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Wrench className="h-4 w-4 text-accent" />
                {m?.nombre_taller ?? "Mecánico verificado"}
                {m?.ciudad && <span className="font-normal text-muted-foreground">· {m.ciudad}</span>}
              </div>
              <p className="mt-2 text-sm">{r.diagnostico}</p>
              {esLaConfirmada && (
                <p className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-success">
                  <CheckCircle2 className="h-4 w-4" /> Solución confirmada
                </p>
              )}
              {esDueno && pub.estado === "respondida" && (
                <Button variant="accent" size="sm" className="mt-3" onClick={() => confirmar(r.id)}>
                  <CheckCircle2 /> Confirmar solución
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
