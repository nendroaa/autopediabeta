import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Car, Wrench, CheckCircle2, MessageSquare, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/AppHeader";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AutoPedia — Diagnósticos confirmados para tu auto" },
      { name: "description", content: "Publica el síntoma de tu auto y recibe el diagnóstico de mecánicos verificados de talleres en Chile." },
      { property: "og:title", content: "AutoPedia — Diagnósticos confirmados para tu auto" },
      { property: "og:description", content: "Conductores y mecánicos verificados resolviendo fallas reales de autos usados en Chile." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { data: total } = useQuery({
    queryKey: ["contador"],
    queryFn: async () => {
      const { data } = await supabase.rpc("contar_soluciones");
      return (data as number) ?? 0;
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <section className="bg-hero px-4 pb-16 pt-6 text-primary-foreground">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between">
            <Logo />
            <Link to="/auth" search={{ modo: "ingreso" }} className="text-sm font-semibold opacity-90 hover:opacity-100">Ingresar</Link>
          </div>
          <h1 className="mt-14 text-4xl font-extrabold leading-tight sm:text-5xl">
            Describe la falla de tu auto. <span className="text-accent">Un mecánico verificado</span> te dice qué tiene.
          </h1>
          <p className="mt-4 max-w-xl text-base opacity-80">
            El foro de diagnóstico para autos usados fuera de garantía en Chile.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild variant="accent" size="lg">
              <Link to="/auth" search={{ rol: "conductor" }}><Car /> Soy conductor</Link>
            </Button>
            <Button asChild variant="heroOutline" size="lg">
              <Link to="/auth" search={{ rol: "mecanico" }}><Wrench /> Soy mecánico</Link>
            </Button>
          </div>
        </div>
      </section>

      <div className="mx-auto -mt-8 max-w-3xl px-4">
        <div className="flex items-center gap-4 rounded-2xl bg-card p-5 shadow-card">
          <CheckCircle2 className="h-10 w-10 shrink-0 text-success" />
          <div>
            <p className="font-display text-3xl font-extrabold">{total ?? "—"}</p>
            <p className="text-sm text-muted-foreground">Soluciones confirmadas</p>
          </div>
        </div>
      </div>

      <section className="mx-auto grid max-w-3xl gap-4 px-4 py-12 sm:grid-cols-3">
        {[
          [Car, "1. Publica el síntoma", "Marca, modelo, año y qué le pasa a tu auto."],
          [MessageSquare, "2. Recibe diagnósticos", "Mecánicos de talleres pyme verificados responden."],
          [ShieldCheck, "3. Confirma la solución", "Marca la respuesta que te sirvió y ayuda a otros."],
        ].map(([I, t, d]) => {
          const Icon = I as typeof Car;
          return (
            <div key={t as string} className="rounded-xl border bg-card p-5">
              <Icon className="h-6 w-6 text-accent" />
              <h3 className="mt-3 font-bold">{t as string}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{d as string}</p>
            </div>
          );
        })}
      </section>
    </div>
  );
}
