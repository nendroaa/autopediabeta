import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Wrench, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePerfil } from "@/lib/perfil";
import { Button } from "@/components/ui/button";

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-display text-lg font-bold">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-foreground">
        <Wrench className="h-4 w-4" />
      </span>
      AutoPedia
    </span>
  );
}

export function AppHeader() {
  const { data: perfil } = usePerfil();
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function salir() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const link = "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-secondary";
  const active = { className: "bg-secondary text-foreground" };

  return (
    <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link to="/panel"><Logo /></Link>
        <Button variant="ghost" size="sm" onClick={salir} aria-label="Cerrar sesión">
          <LogOut /> <span className="hidden sm:inline">Salir</span>
        </Button>
      </div>
      <nav className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-4 pb-2">
        {perfil?.rol === "conductor" && (
          <Link to="/conductor" className={link} activeProps={active}>Mis publicaciones</Link>
        )}
        {perfil?.rol === "mecanico" && (
          <Link to="/mecanico" className={link} activeProps={active}>Panel mecánico</Link>
        )}
        <Link to="/foro" className={link} activeProps={active}>Buscador del foro</Link>
        {perfil?.esAdmin && (
          <Link to="/admin" className={link} activeProps={active}>Administración</Link>
        )}
      </nav>
    </header>
  );
}
