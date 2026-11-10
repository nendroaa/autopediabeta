CREATE TABLE public.eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('registro','activacion','transaccion_completada','clic_cta_comercial')),
  user_id uuid,
  fecha timestamptz NOT NULL DEFAULT now(),
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX eventos_fecha_idx ON public.eventos (fecha DESC);
GRANT SELECT ON public.eventos TO authenticated;
GRANT ALL ON public.eventos TO service_role;
ALTER TABLE public.eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin ve eventos" ON public.eventos FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin ve transacciones" ON public.transacciones FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin ve publicaciones" ON public.publicaciones FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.ev_registro() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.eventos (tipo, user_id, detalle) VALUES ('registro', NEW.id, jsonb_build_object('rol', NEW.rol));
  RETURN NEW;
END $$;
CREATE TRIGGER ev_tras_registro AFTER INSERT ON public.perfiles FOR EACH ROW EXECUTE FUNCTION public.ev_registro();

CREATE OR REPLACE FUNCTION public.ev_activacion_publicar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.publicaciones WHERE conductor_id = NEW.conductor_id AND id <> NEW.id)
     AND NOT EXISTS (SELECT 1 FROM public.eventos WHERE tipo = 'activacion' AND user_id = NEW.conductor_id) THEN
    INSERT INTO public.eventos (tipo, user_id, detalle) VALUES ('activacion', NEW.conductor_id, jsonb_build_object('accion','primer_caso','publicacion_id',NEW.id));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ev_tras_publicar AFTER INSERT ON public.publicaciones FOR EACH ROW EXECUTE FUNCTION public.ev_activacion_publicar();

CREATE OR REPLACE FUNCTION public.ev_activacion_responder() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.respuestas WHERE mecanico_id = NEW.mecanico_id AND id <> NEW.id)
     AND NOT EXISTS (SELECT 1 FROM public.eventos WHERE tipo = 'activacion' AND user_id = NEW.mecanico_id) THEN
    INSERT INTO public.eventos (tipo, user_id, detalle) VALUES ('activacion', NEW.mecanico_id, jsonb_build_object('accion','primera_respuesta','publicacion_id',NEW.publicacion_id));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ev_tras_responder AFTER INSERT ON public.respuestas FOR EACH ROW EXECUTE FUNCTION public.ev_activacion_responder();

CREATE OR REPLACE FUNCTION public.ev_transaccion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estado = 'confirmada' AND OLD.estado IS DISTINCT FROM 'confirmada' THEN
    INSERT INTO public.eventos (tipo, user_id, detalle) VALUES ('transaccion_completada', NEW.conductor_id, jsonb_build_object('transaccion_id', NEW.id));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ev_tras_confirmar AFTER UPDATE ON public.transacciones FOR EACH ROW EXECUTE FUNCTION public.ev_transaccion();

CREATE OR REPLACE FUNCTION public.registrar_clic_destacar() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'mecanico') THEN
    RAISE EXCEPTION 'Solo mecánicos';
  END IF;
  INSERT INTO public.eventos (tipo, user_id) VALUES ('clic_cta_comercial', auth.uid());
END $$;
REVOKE EXECUTE ON FUNCTION public.registrar_clic_destacar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_clic_destacar() TO authenticated;

INSERT INTO public.eventos (tipo, user_id, fecha, detalle) SELECT 'registro', id, created_at, jsonb_build_object('rol', rol) FROM public.perfiles;

ALTER PUBLICATION supabase_realtime ADD TABLE public.eventos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transacciones;