import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePerfil, MARCAS } from "@/lib/perfil";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EstadoBadge } from "@/components/EstadoBadge";

export const Route = createFileRoute("/_authenticated/conductor")({
  head: () => ({ meta: [{ title: "Mis publicaciones — AutoPedia" }, { name: "robots", content: "noindex" }] }),
  component: PanelConductor,
});

function PanelConductor() {
  const { data: perfil } = usePerfil();
  const { data: pubs, isLoading } = useQuery({
    queryKey: ["mis-publicaciones", perfil?.id],
    enabled: !!perfil,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("publicaciones").select("*, respuestas(count)")
        .eq("conductor_id", perfil!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (perfil && perfil.rol !== "conductor")
    return <p className="text-muted-foreground">Esta sección es solo para conductores.</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Hola{perfil?.nombre ? `, ${perfil.nombre}` : ""}</h1>
          <p className="text-sm text-muted-foreground">Tus consultas y su estado.</p>
        </div>
        <NuevaPublicacion />
      </div>
      {isLoading && <p className="text-muted-foreground">Cargando…</p>}
      {pubs?.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          Aún no publicas síntomas. Pulsa “Publicar síntoma” para empezar.
        </div>
      )}
      <ul className="space-y-3">
        {pubs?.map((p) => (
          <li key={p.id}>
            <Link to="/publicacion/$id" params={{ id: p.id }}
              className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-card hover:border-accent">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <EstadoBadge estado={p.estado} />
                  <span className="text-xs text-muted-foreground">{p.marca} {p.modelo} {p.anio}</span>
                </div>
                <p className="mt-1 truncate font-semibold">{p.sintoma}</p>
                <p className="text-xs text-muted-foreground">
                  {(p.respuestas as unknown as { count: number }[])[0]?.count ?? 0} respuesta(s)
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NuevaPublicacion() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ marca: "", modelo: "", anio: "", sintoma: "", descripcion: "" });
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const anio = Number(f.anio);
    if (!anio || anio < 1980 || anio > new Date().getFullYear() + 1) return toast.error("Año inválido");
    setGuardando(true);
    const { error } = await supabase.from("publicaciones").insert({
      marca: f.marca.trim(), modelo: f.modelo.trim(), anio, sintoma: f.sintoma.trim(), descripcion: f.descripcion.trim(),
    });
    setGuardando(false);
    if (error) return toast.error("No se pudo publicar: " + error.message);
    toast.success("Síntoma publicado");
    setF({ marca: "", modelo: "", anio: "", sintoma: "", descripcion: "" });
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["mis-publicaciones"] });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent"><Plus /> Publicar síntoma</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Publicar síntoma</DialogTitle></DialogHeader>
        <form onSubmit={guardar} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Marca</Label>
              <Input list="marcas" required value={f.marca} onChange={(e) => setF({ ...f, marca: e.target.value })} />
              <datalist id="marcas">{MARCAS.map((m) => <option key={m} value={m} />)}</datalist>
            </div>
            <div className="space-y-1.5">
              <Label>Modelo</Label>
              <Input required value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Año</Label>
            <Input type="number" inputMode="numeric" required value={f.anio} onChange={(e) => setF({ ...f, anio: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Síntoma</Label>
            <Input required placeholder="Ej: Ruido al frenar" value={f.sintoma} onChange={(e) => setF({ ...f, sintoma: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea rows={4} placeholder="¿Cuándo pasa? ¿Desde cuándo?" value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} />
          </div>
          <Button type="submit" variant="accent" className="w-full" disabled={guardando}>
            {guardando ? "Publicando…" : "Publicar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
