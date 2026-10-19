
create type public.app_role as enum ('admin');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "ver mis roles" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null default '',
  rol text not null check (rol in ('conductor','mecanico')),
  nombre_taller text,
  ciudad text,
  verificado boolean not null default false,
  created_at timestamptz not null default now()
);
grant select on public.perfiles to authenticated;
grant update (nombre, nombre_taller, ciudad) on public.perfiles to authenticated;
grant all on public.perfiles to service_role;
alter table public.perfiles enable row level security;
create policy "ver mi perfil" on public.perfiles for select to authenticated using (id = auth.uid());
create policy "ver mecanicos" on public.perfiles for select to authenticated using (rol = 'mecanico');
create policy "admin ve perfiles" on public.perfiles for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "editar mi perfil" on public.perfiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.es_mecanico_verificado(_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = _uid and rol = 'mecanico' and verificado)
$$;
create or replace function public.es_conductor(_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = _uid and rol = 'conductor')
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare r text := coalesce(new.raw_user_meta_data->>'rol','conductor');
begin
  if r not in ('conductor','mecanico') then r := 'conductor'; end if;
  insert into public.perfiles (id, nombre, rol, nombre_taller, ciudad)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre',''), r,
    nullif(new.raw_user_meta_data->>'nombre_taller',''), nullif(new.raw_user_meta_data->>'ciudad',''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.publicaciones (
  id uuid primary key default gen_random_uuid(),
  conductor_id uuid not null default auth.uid(),
  marca text not null, modelo text not null, anio int not null,
  sintoma text not null, descripcion text not null default '',
  estado text not null default 'publicada' check (estado in ('publicada','respondida','confirmada')),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.publicaciones to authenticated;
grant all on public.publicaciones to service_role;
alter table public.publicaciones enable row level security;
create policy "conductor ve las suyas" on public.publicaciones for select to authenticated using (conductor_id = auth.uid());
create policy "mecanico verificado ve abiertas" on public.publicaciones for select to authenticated
  using (estado in ('publicada','respondida') and public.es_mecanico_verificado(auth.uid()));
create policy "todos ven confirmadas" on public.publicaciones for select to authenticated using (estado = 'confirmada');
create policy "conductor crea" on public.publicaciones for insert to authenticated
  with check (conductor_id = auth.uid() and estado = 'publicada' and public.es_conductor(auth.uid()));
create policy "conductor edita" on public.publicaciones for update to authenticated
  using (conductor_id = auth.uid() and estado <> 'confirmada') with check (conductor_id = auth.uid() and estado <> 'confirmada');
create policy "conductor borra" on public.publicaciones for delete to authenticated using (conductor_id = auth.uid() and estado = 'publicada');

create table public.respuestas (
  id uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references public.publicaciones(id) on delete cascade,
  mecanico_id uuid not null default auth.uid(),
  diagnostico text not null,
  created_at timestamptz not null default now()
);
grant select, insert on public.respuestas to authenticated;
grant all on public.respuestas to service_role;
alter table public.respuestas enable row level security;
create policy "mecanico ve las suyas" on public.respuestas for select to authenticated using (mecanico_id = auth.uid());
create policy "conductor ve respuestas a lo suyo" on public.respuestas for select to authenticated
  using (exists (select 1 from public.publicaciones p where p.id = publicacion_id and p.conductor_id = auth.uid()));
create policy "todos ven respuestas confirmadas" on public.respuestas for select to authenticated
  using (exists (select 1 from public.publicaciones p where p.id = publicacion_id and p.estado = 'confirmada'));
create policy "mecanico verificado responde" on public.respuestas for insert to authenticated
  with check (mecanico_id = auth.uid() and public.es_mecanico_verificado(auth.uid())
    and exists (select 1 from public.publicaciones p where p.id = publicacion_id and p.estado in ('publicada','respondida')));

create table public.transacciones (
  id uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references public.publicaciones(id) on delete cascade,
  respuesta_id uuid not null references public.respuestas(id) on delete cascade,
  conductor_id uuid not null, mecanico_id uuid not null,
  pagador text not null default 'ninguno',
  precio integer not null default 0,
  comision integer not null default 0,
  estado text not null default 'respondida' check (estado in ('publicada','respondida','confirmada')),
  created_at timestamptz not null default now()
);
grant select on public.transacciones to authenticated;
grant all on public.transacciones to service_role;
alter table public.transacciones enable row level security;
create policy "partes ven su transaccion" on public.transacciones for select to authenticated
  using (conductor_id = auth.uid() or mecanico_id = auth.uid());

create or replace function public.al_responder()
returns trigger language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  select conductor_id into c from public.publicaciones where id = new.publicacion_id;
  update public.publicaciones set estado = 'respondida' where id = new.publicacion_id and estado = 'publicada';
  insert into public.transacciones (publicacion_id, respuesta_id, conductor_id, mecanico_id, estado)
  values (new.publicacion_id, new.id, c, new.mecanico_id, 'respondida');
  return new;
end $$;
create trigger tras_responder after insert on public.respuestas for each row execute function public.al_responder();

create or replace function public.confirmar_solucion(_respuesta_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select r.publicacion_id into pid from public.respuestas r join public.publicaciones p on p.id = r.publicacion_id
    where r.id = _respuesta_id and p.conductor_id = auth.uid() and p.estado = 'respondida';
  if pid is null then raise exception 'No puedes confirmar esta respuesta'; end if;
  update public.publicaciones set estado = 'confirmada' where id = pid;
  update public.transacciones set estado = 'confirmada' where respuesta_id = _respuesta_id;
end $$;
revoke execute on function public.confirmar_solucion(uuid) from public, anon;
grant execute on function public.confirmar_solucion(uuid) to authenticated;

create or replace function public.verificar_mecanico(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Solo administradores'; end if;
  update public.perfiles set verificado = true where id = _id and rol = 'mecanico';
end $$;
revoke execute on function public.verificar_mecanico(uuid) from public, anon;
grant execute on function public.verificar_mecanico(uuid) to authenticated;

create or replace function public.contar_soluciones()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.publicaciones where estado = 'confirmada'
$$;
grant execute on function public.contar_soluciones() to anon, authenticated;

-- Datos de demostración
insert into public.publicaciones (id, conductor_id, marca, modelo, anio, sintoma, descripcion, estado) values
('a0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1','Chevrolet','Sail',2015,'Ruido al frenar','Chirrido metálico fuerte cada vez que freno, sobre todo en bajada.','confirmada'),
('a0000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000c1','Suzuki','Swift',2013,'No parte en frío','En las mañanas de invierno le cuesta partir, da arranque pero no prende hasta el tercer intento.','confirmada'),
('a0000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000c2','Hyundai','Accent',2016,'Luz check engine encendida','Se prendió la luz de check engine y el auto anda un poco tironeado.','confirmada'),
('a0000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-0000000000c2','Kia','Morning',2014,'Vibración en ralentí','Detenido en semáforo vibra todo el volante y la palanca.','confirmada'),
('a0000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-0000000000c3','Toyota','Yaris',2012,'Se calienta el motor','La aguja de temperatura sube mucho en taco y huele a dulce.','confirmada'),
('a0000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-0000000000c3','Nissan','Versa',2017,'Ruido al girar el volante','Suena un clac-clac al doblar con el volante a fondo.','confirmada');

insert into public.respuestas (publicacion_id, mecanico_id, diagnostico)
select * from (values
('a0000000-0000-0000-0000-000000000001'::uuid,'00000000-0000-0000-0000-0000000000a1'::uuid,'Pastillas delanteras gastadas hasta el testigo metálico. Cambiar pastillas y rectificar discos si tienen surcos. Costo aproximado en taller pyme: $45.000–$70.000.'),
('a0000000-0000-0000-0000-000000000002'::uuid,'00000000-0000-0000-0000-0000000000a1'::uuid,'Bujías desgastadas y batería débil (menos de 12,4 V en reposo). Reemplazar bujías y medir batería; si tiene más de 3 años, cambiarla.'),
('a0000000-0000-0000-0000-000000000003'::uuid,'00000000-0000-0000-0000-0000000000a2'::uuid,'Código P0301: falla de encendido cilindro 1. Bobina de encendido defectuosa. Se cambió la bobina y se borró el código.'),
('a0000000-0000-0000-0000-000000000004'::uuid,'00000000-0000-0000-0000-0000000000a2'::uuid,'Soporte de motor del lado derecho roto. Reemplazar soporte; revisar también el soporte de caja.'),
('a0000000-0000-0000-0000-000000000005'::uuid,'00000000-0000-0000-0000-0000000000a1'::uuid,'Fuga de refrigerante por manguera superior del radiador y electroventilador sin funcionar (relé quemado). Cambiar manguera, relé y rellenar refrigerante.'),
('a0000000-0000-0000-0000-000000000006'::uuid,'00000000-0000-0000-0000-0000000000a2'::uuid,'Homocinética exterior izquierda con desgaste (guardapolvo roto). Reemplazar homocinética y guardapolvo.')
) v;

update public.transacciones set estado = 'confirmada';
