import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Perfil = {
  id: string;
  nombre: string;
  rol: "conductor" | "mecanico";
  nombre_taller: string | null;
  ciudad: string | null;
  verificado: boolean;
  esAdmin: boolean;
};

export function usePerfil() {
  return useQuery({
    queryKey: ["perfil"],
    queryFn: async (): Promise<Perfil | null> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const [{ data: p }, { data: roles }] = await Promise.all([
        supabase.from("perfiles").select("*").eq("id", u.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
      ]);
      if (!p) return null;
      return { ...(p as Omit<Perfil, "esAdmin">), esAdmin: (roles ?? []).some((r) => r.role === "admin") };
    },
  });
}

export const ESTADO_LABEL: Record<string, string> = {
  publicada: "Publicada",
  respondida: "Respondida",
  confirmada: "Confirmada",
};

export const MARCAS = [
  "Chevrolet", "Suzuki", "Hyundai", "Kia", "Toyota", "Nissan", "Peugeot",
  "Mazda", "Ford", "Volkswagen", "Mitsubishi", "Renault", "Chery", "MG", "Otra",
];
