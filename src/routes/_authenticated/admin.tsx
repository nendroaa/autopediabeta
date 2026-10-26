import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePerfil } from "@/lib/perfil";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Administración — AutoPedia" }, { name: "description", content: "Gestiona la verificación de talleres registrados en AutoPedia." }, { property: "og:title", content: "Administración — AutoPedia" }, { property: "og:description", content: "Gestiona la verificación de talleres registrados en AutoPedia." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: Admin,
});

function Admin() {
  const { data: perfil, isLoading } = usePerfil();
  const qc = useQueryClient();
  const { data: pendientes } = useQuery({
    queryKey: ["pendientes"],
    enabled: !!perfil?.esAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("perfiles").select("*")
        .eq("rol", "mecanico").eq("verificado", false).order("created_at");
      if (error) throw error;
      return data;
    },
  });

  async function verificar(id: string) {
    const { error } = await supabase.rpc("verificar_mecanico", { _id: id });
    if (error) { toast.error(error.message); return; }
    toast.success("Mecánico verificado");
    qc.invalidateQueries({ queryKey: ["pendientes"] });
  }

  if (isLoading) return <p className="text-muted-foreground">Cargando…</p>;
  if (!perfil?.esAdmin) return <p className="text-muted-foreground">No tienes acceso a esta sección.</p>;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Mecánicos pendientes</h1>
      {pendientes?.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No hay mecánicos pendientes.</p>}
      <ul className="space-y-3">
        {pendientes?.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4">
            <div>
              <p className="font-semibold">{m.nombre_taller}</p>
              <p className="text-sm text-muted-foreground">{m.nombre} · {m.ciudad}</p>
            </div>
            <Button variant="accent" size="sm" onClick={() => verificar(m.id)}>Verificar</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
