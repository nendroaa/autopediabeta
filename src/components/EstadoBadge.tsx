import { Badge } from "@/components/ui/badge";
import { ESTADO_LABEL } from "@/lib/perfil";

export function EstadoBadge({ estado }: { estado: string }) {
  const v = (["publicada", "respondida", "confirmada"].includes(estado) ? estado : "outline") as
    | "publicada"
    | "respondida"
    | "confirmada";
  return <Badge variant={v}>{ESTADO_LABEL[estado] ?? estado}</Badge>;
}
