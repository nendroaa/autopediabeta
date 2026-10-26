ALTER TABLE public.transacciones ALTER COLUMN respuesta_id DROP NOT NULL;
ALTER TABLE public.transacciones ALTER COLUMN mecanico_id DROP NOT NULL;
ALTER TABLE public.transacciones ALTER COLUMN estado SET DEFAULT 'publicada';
ALTER TABLE public.transacciones ADD CONSTRAINT transacciones_publicacion_unique UNIQUE (publicacion_id);

INSERT INTO public.transacciones (publicacion_id, respuesta_id, conductor_id, mecanico_id, estado, created_at)
SELECT p.id, CASE WHEN p.estado = 'confirmada' THEN r.id ELSE NULL END, p.conductor_id, r.mecanico_id, p.estado, p.created_at
FROM public.publicaciones p
LEFT JOIN LATERAL (SELECT id, mecanico_id FROM public.respuestas WHERE publicacion_id = p.id ORDER BY created_at, id LIMIT 1) r ON true
WHERE NOT EXISTS (SELECT 1 FROM public.transacciones t WHERE t.publicacion_id = p.id);
UPDATE public.transacciones t SET estado = p.estado, respuesta_id = CASE WHEN p.estado = 'confirmada' THEN t.respuesta_id ELSE NULL END FROM public.publicaciones p WHERE p.id = t.publicacion_id;

ALTER TABLE public.transacciones ADD CONSTRAINT transacciones_conductor_perfil_fk FOREIGN KEY (conductor_id) REFERENCES public.perfiles(id) NOT VALID;
ALTER TABLE public.transacciones ADD CONSTRAINT transacciones_mecanico_perfil_fk FOREIGN KEY (mecanico_id) REFERENCES public.perfiles(id) NOT VALID;
COMMENT ON CONSTRAINT transacciones_conductor_perfil_fk ON public.transacciones IS 'Existing demonstration rows use legacy fictitious profile IDs; enforced for all new rows.';
COMMENT ON CONSTRAINT transacciones_mecanico_perfil_fk ON public.transacciones IS 'Existing demonstration rows use legacy fictitious profile IDs; enforced for all new rows.';

REVOKE INSERT, UPDATE, DELETE ON public.transacciones FROM anon, authenticated;
GRANT SELECT ON public.transacciones TO authenticated;
GRANT ALL ON public.transacciones TO service_role;
ALTER TABLE public.transacciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partes ven su transaccion" ON public.transacciones;
CREATE POLICY "conductor ve su transaccion" ON public.transacciones FOR SELECT TO authenticated USING (conductor_id = auth.uid() AND public.es_conductor(auth.uid()));
CREATE POLICY "mecanico ve su transaccion" ON public.transacciones FOR SELECT TO authenticated USING (mecanico_id = auth.uid() AND EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'mecanico'));

CREATE OR REPLACE FUNCTION public.impedir_borrado_transaccion()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Las transacciones no se pueden borrar';
END;
$$;
CREATE TRIGGER impedir_borrado_transaccion BEFORE DELETE ON public.transacciones FOR EACH ROW EXECUTE FUNCTION public.impedir_borrado_transaccion();

CREATE OR REPLACE FUNCTION public.al_publicar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.transacciones (publicacion_id, conductor_id, estado, pagador, precio, comision)
  VALUES (NEW.id, NEW.conductor_id, 'publicada', 'ninguno', 0, 0);
  RETURN NEW;
END;
$$;
CREATE TRIGGER tras_publicar AFTER INSERT ON public.publicaciones FOR EACH ROW EXECUTE FUNCTION public.al_publicar();

CREATE OR REPLACE FUNCTION public.al_responder()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e text;
BEGIN
  SELECT estado INTO e FROM public.publicaciones WHERE id = NEW.publicacion_id FOR UPDATE;
  IF e IS NULL OR e = 'confirmada' THEN RAISE EXCEPTION 'Esta publicación no admite respuestas'; END IF;
  IF NOT public.es_mecanico_verificado(NEW.mecanico_id) THEN RAISE EXCEPTION 'Solo un mecánico verificado puede responder'; END IF;
  UPDATE public.transacciones SET estado = 'respondida', mecanico_id = NEW.mecanico_id
    WHERE publicacion_id = NEW.publicacion_id AND estado = 'publicada';
  UPDATE public.publicaciones SET estado = 'respondida' WHERE id = NEW.publicacion_id AND estado = 'publicada';
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirmar_solucion(_respuesta_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid; mid uuid; owner_id uuid; e text;
BEGIN
  SELECT publicacion_id, mecanico_id INTO pid, mid FROM public.respuestas WHERE id = _respuesta_id;
  IF pid IS NULL THEN RAISE EXCEPTION 'No puedes confirmar esta respuesta'; END IF;
  SELECT conductor_id, estado INTO owner_id, e FROM public.publicaciones WHERE id = pid FOR UPDATE;
  IF auth.uid() IS NULL OR owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Solo el conductor de la publicación puede confirmar'; END IF;
  IF e = 'confirmada' OR EXISTS (SELECT 1 FROM public.transacciones WHERE publicacion_id = pid AND estado = 'confirmada') THEN RAISE EXCEPTION 'La solución ya está confirmada'; END IF;
  IF e <> 'respondida' THEN RAISE EXCEPTION 'La publicación no tiene una respuesta pendiente'; END IF;
  UPDATE public.transacciones SET estado = 'confirmada', respuesta_id = _respuesta_id, mecanico_id = mid
    WHERE publicacion_id = pid AND estado = 'respondida';
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe una transacción pendiente para esta publicación'; END IF;
  UPDATE public.publicaciones SET estado = 'confirmada' WHERE id = pid;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.confirmar_solucion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_solucion(uuid) TO authenticated;
REVOKE UPDATE ON public.publicaciones FROM authenticated;
GRANT UPDATE (marca, modelo, anio, sintoma, descripcion) ON public.publicaciones TO authenticated;
