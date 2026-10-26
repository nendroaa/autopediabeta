import { createFileRoute, Navigate } from "@tanstack/react-router";
import { usePerfil } from "@/lib/perfil";

export const Route = createFileRoute("/_authenticated/panel")({
  head: () => ({ meta: [{ title: "Panel — AutoPedia" }, { name: "description", content: "Accede a tu espacio de conductor o mecánico en AutoPedia." }, { property: "og:title", content: "Panel — AutoPedia" }, { property: "og:description", content: "Accede a tu espacio de conductor o mecánico en AutoPedia." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: Panel,
});

function Panel() {
  const { data, isLoading } = usePerfil();
  if (isLoading) return <p className="text-muted-foreground">Cargando…</p>;
  if (data?.rol === "mecanico") return <Navigate to="/mecanico" replace />;
  if (data?.rol === "conductor") return <Navigate to="/conductor" replace />;
  return <Navigate to="/foro" replace />;
}
