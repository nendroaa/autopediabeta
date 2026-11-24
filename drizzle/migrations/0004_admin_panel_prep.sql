CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select auth.uid() is not null and public.has_role(auth.uid(), 'admin')
$$;

ALTER TABLE public.eventos ADD COLUMN IF NOT EXISTS rol text;
UPDATE public.eventos e SET rol = p.rol FROM public.perfiles p WHERE p.id = e.user_id AND e.rol IS NULL;
ALTER TABLE public.eventos ADD CONSTRAINT eventos_tipo_valido CHECK (tipo IN ('registro','activacion','transaccion_completada','clic_cta_comercial'));

ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'beta_actual' CHECK (origen IN ('beta_actual','beta_anterior'));
ALTER TABLE public.eventos ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'beta_actual' CHECK (origen IN ('beta_actual','beta_anterior'));
ALTER TABLE public.publicaciones ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'beta_actual' CHECK (origen IN ('beta_actual','beta_anterior'));
ALTER TABLE public.transacciones ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'beta_actual' CHECK (origen IN ('beta_actual','beta_anterior'));

CREATE OR REPLACE FUNCTION public.ev_registro() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.eventos (tipo, user_id, rol, detalle) VALUES ('registro', NEW.id, NEW.rol, jsonb_build_object('rol', NEW.rol));
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.ev_activacion_publicar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.publicaciones WHERE conductor_id = NEW.conductor_id AND id <> NEW.id)
     AND NOT EXISTS (SELECT 1 FROM public.eventos WHERE tipo = 'activacion' AND user_id = NEW.conductor_id) THEN
    INSERT INTO public.eventos (tipo, user_id, rol, detalle) VALUES ('activacion', NEW.conductor_id, 'conductor', jsonb_build_object('accion','primer_caso','publicacion_id',NEW.id));
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.ev_activacion_responder() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.respuestas WHERE mecanico_id = NEW.mecanico_id AND id <> NEW.id)
     AND NOT EXISTS (SELECT 1 FROM public.eventos WHERE tipo = 'activacion' AND user_id = NEW.mecanico_id) THEN
    INSERT INTO public.eventos (tipo, user_id, rol, detalle) VALUES ('activacion', NEW.mecanico_id, 'mecanico', jsonb_build_object('accion','primera_respuesta','publicacion_id',NEW.publicacion_id));
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.ev_transaccion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estado = 'confirmada' AND OLD.estado IS DISTINCT FROM 'confirmada' THEN
    INSERT INTO public.eventos (tipo, user_id, rol, detalle) VALUES ('transaccion_completada', NEW.conductor_id, 'conductor', jsonb_build_object('transaccion_id', NEW.id, 'publicacion_id', NEW.publicacion_id));
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.registrar_clic_destacar() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text;
BEGIN
  SELECT rol INTO r FROM public.perfiles WHERE id = auth.uid();
  IF r IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión'; END IF;
  INSERT INTO public.eventos (tipo, user_id, rol) VALUES ('clic_cta_comercial', auth.uid(), r);
END $$;

DROP POLICY IF EXISTS "admin ve eventos" ON public.eventos;
CREATE POLICY "admin ve eventos" ON public.eventos FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "admin ve perfiles" ON public.perfiles;
CREATE POLICY "admin ve perfiles" ON public.perfiles FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admin actualiza perfiles" ON public.perfiles FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "admin ve publicaciones" ON public.publicaciones;
CREATE POLICY "admin ve publicaciones" ON public.publicaciones FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admin ve respuestas" ON public.respuestas FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "admin ve transacciones" ON public.transacciones;
CREATE POLICY "admin ve transacciones" ON public.transacciones FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.perfil_campos_protegidos() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.rol IS DISTINCT FROM OLD.rol OR NEW.origen IS DISTINCT FROM OLD.origen THEN
    RAISE EXCEPTION 'Estos campos no se pueden modificar';
  END IF;
  IF NEW.verificado IS DISTINCT FROM OLD.verificado AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradoras pueden cambiar la verificación';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER perfil_campos_protegidos BEFORE UPDATE ON public.perfiles FOR EACH ROW
  WHEN (current_user IN ('authenticated','anon')) EXECUTE FUNCTION public.perfil_campos_protegidos();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='eventos') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.eventos;
  END IF;
END $$;