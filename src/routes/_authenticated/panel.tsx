import { createFileRoute, Navigate } from "@tanstack/react-router";
import { usePerfil } from "@/lib/perfil";

export const Route = createFileRoute("/_authenticated/panel")({
  head: () => ({ meta: [{ title: "Panel — AutoPedia" }, { name: "robots", content: "noindex" }] }),
  component: Panel,
});

function Panel() {
  const { data, isLoading } = usePerfil();
  if (isLoading) return <p className="text-muted-foreground">Cargando…</p>;
  if (data?.rol === "mecanico") return <Navigate to="/mecanico" replace />;
  if (data?.rol === "conductor") return <Navigate to="/conductor" replace />;
  return <Navigate to="/foro" replace />;
}
