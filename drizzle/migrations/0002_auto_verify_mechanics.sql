alter table public.perfiles alter column verificado set default true;
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare r text := coalesce(new.raw_user_meta_data->>'rol','conductor');
begin
  if r not in ('conductor','mecanico') then r := 'conductor'; end if;
  insert into public.perfiles (id, nombre, rol, nombre_taller, ciudad, verificado)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre',''), r,
    nullif(new.raw_user_meta_data->>'nombre_taller',''), nullif(new.raw_user_meta_data->>'ciudad',''), true);
  return new;
end $$;
update public.perfiles set verificado = true where rol = 'mecanico' and verificado = false;