import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Car, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/AppHeader";
import { cn } from "@/lib/utils";

type Search = { rol?: "conductor" | "mecanico"; modo?: "registro" | "ingreso" };

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    rol: s.rol === "mecanico" ? "mecanico" : s.rol === "conductor" ? "conductor" : undefined,
    modo: s.modo === "ingreso" ? "ingreso" : s.modo === "registro" ? "registro" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Ingresar o registrarse — AutoPedia" },
      { name: "description", content: "Crea tu cuenta de conductor o mecánico en AutoPedia." },
      { property: "og:title", content: "Ingresar o registrarse — AutoPedia" },
      { property: "og:description", content: "Crea tu cuenta de conductor o mecánico en AutoPedia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [modo, setModo] = useState<"registro" | "ingreso">(search.modo ?? (search.rol ? "registro" : "ingreso"));
  const [rol, setRol] = useState<"conductor" | "mecanico">(search.rol ?? "conductor");
  const [f, setF] = useState({ nombre: "", email: "", password: "", nombre_taller: "", ciudad: "" });
  const [cargando, setCargando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    try {
      if (modo === "ingreso") {
        const { error } = await supabase.auth.signInWithPassword({ email: f.email, password: f.password });
        if (error) throw error;
        navigate({ to: "/panel" });
      } else {
        if (rol === "mecanico" && (!f.nombre_taller.trim() || !f.ciudad.trim())) {
          throw new Error("Los mecánicos deben indicar el nombre del taller y la ciudad.");
        }
        const { data, error } = await supabase.auth.signUp({
          email: f.email,
          password: f.password,
          options: {
            emailRedirectTo: window.location.origin + "/panel",
            data: { nombre: f.nombre, rol, nombre_taller: f.nombre_taller, ciudad: f.ciudad },
          },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/panel" });
        else setEnviado(true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Algo salió mal";
      toast.error(msg === "Invalid login credentials" ? "Correo o contraseña incorrectos" : msg);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-hero px-4 py-8 text-primary-foreground">
      <Link to="/" className="mx-auto mb-6"><Logo /></Link>
      <div className="mx-auto w-full max-w-md rounded-2xl bg-card p-6 text-card-foreground shadow-card">
        {enviado ? (
          <div className="space-y-3 text-center">
            <h1 className="text-xl font-bold">Revisa tu correo</h1>
            <p className="text-sm text-muted-foreground">
              Te enviamos un enlace a <strong>{f.email}</strong> para confirmar tu cuenta.
            </p>
            <Button variant="outline" onClick={() => { setEnviado(false); setModo("ingreso"); }}>Ir a ingresar</Button>
          </div>
        ) : (
          <>
            <div className="mb-5 grid grid-cols-2 rounded-lg bg-secondary p-1 text-sm font-semibold">
              {(["ingreso", "registro"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setModo(m)}
                  className={cn("rounded-md py-2", modo === m ? "bg-card shadow-card" : "text-muted-foreground")}>
                  {m === "ingreso" ? "Ingresar" : "Crear cuenta"}
                </button>
              ))}
            </div>
            <form onSubmit={enviar} className="space-y-4">
              {modo === "registro" && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {([["conductor", "Soy conductor", Car], ["mecanico", "Soy mecánico", Wrench]] as const).map(([r, l, I]) => (
                      <button key={r} type="button" onClick={() => setRol(r)}
                        className={cn("flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-sm font-semibold",
                          rol === r ? "border-accent bg-accent/10" : "border-border")}>
                        <I className="h-5 w-5" /> {l}
                      </button>
                    ))}
                  </div>
                  <Campo label="Nombre"><Input required value={f.nombre} onChange={set("nombre")} /></Campo>
                  {rol === "mecanico" && (
                    <>
                      <Campo label="Nombre del taller"><Input required value={f.nombre_taller} onChange={set("nombre_taller")} /></Campo>
                      <Campo label="Ciudad"><Input required value={f.ciudad} onChange={set("ciudad")} placeholder="Ej: Santiago" /></Campo>
                    </>
                  )}
                </>
              )}
              <Campo label="Correo"><Input type="email" required value={f.email} onChange={set("email")} /></Campo>
              <Campo label="Contraseña"><Input type="password" required minLength={6} value={f.password} onChange={set("password")} /></Campo>
              <Button type="submit" variant="accent" size="lg" className="w-full" disabled={cargando}>
                {cargando ? "Un momento…" : modo === "ingreso" ? "Ingresar" : "Crear cuenta"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
