-- =====================================================================
-- MAVIX - schema.sql
-- Pégalo completo en Supabase > SQL Editor > Run.
--
-- ATENCIÓN: este script BORRA y vuelve a crear las tablas del sitio
-- (profiles, solicitudes, anuncios, pagos, historial, config, categorias).
-- Úsalo solo si aún estás probando. No toca las cuentas de Authentication.
-- =====================================================================

-- ---------- 0. Limpieza ----------
drop trigger if exists on_auth_user_created on auth.users;
drop table if exists pagos, historial, anuncios, solicitudes, categorias, config, profiles cascade;
drop function if exists handle_new_user() cascade;
drop function if exists email_de_usuario(text);
drop function if exists borrar_usuario(uuid);
drop function if exists publicar_solicitud(uuid, int);
drop function if exists limite_pendientes() cascade;
drop function if exists is_admin() cascade;
drop function if exists fotos_validas(text[]) cascade;
drop domain if exists ciudad_t cascade;
drop domain if exists cat_t cascade;

-- ---------- 1. Tipos y utilidades ----------
create domain ciudad_t as text check (value in
 ('Cusco','Sicuani','Espinar','Santo Tomás','Juliaca','Puno','Puerto Maldonado','Otros'));
create domain cat_t as text check (value in ('emp','ser','alq','veh','tec','otr'));

-- solo se aceptan fotos que estén en el Storage de tu proyecto (bucket "fotos")
create function fotos_validas(f text[]) returns boolean language sql immutable as $$
 select coalesce(bool_and(x like 'https://xgejvhoyctqehtaipdzm.supabase.co/storage/v1/object/public/fotos/%'), true)
 from unnest(f) x $$;

-- ---------- 2. Tablas ----------
create table profiles(
 id uuid primary key references auth.users(id) on delete cascade,
 username text not null check (char_length(username) between 3 and 30),
 email text not null,
 ciudad ciudad_t not null,
 role text not null default 'user' check (role in ('user','admin')),
 creado timestamptz not null default now());
create unique index profiles_username_uq on profiles (lower(username));

create table solicitudes(
 id uuid primary key default gen_random_uuid(),
 codigo text not null unique default 'MX-'||upper(substr(md5(random()::text||clock_timestamp()::text),1,5)),
 user_id uuid not null references profiles(id) on delete cascade,
 ciudad ciudad_t not null,
 cat cat_t not null,
 sub text check (sub is null or sub in ('carros','motos')),
 titulo text not null check (char_length(titulo) between 5 and 70),
 descripcion text not null check (char_length(descripcion) between 10 and 400),
 precio integer check (precio is null or precio >= 0),
 tel text not null check (tel ~ '^9[0-9]{8}$'),
 wa text not null check (wa ~ '^9[0-9]{8}$'),
 fotos text[] not null default '{}' check (cardinality(fotos) <= 3 and fotos_validas(fotos)),
 dias int not null check (dias in (3,7,10)),
 estado text not null default 'pendiente' check (estado in ('pendiente','aprobada','publicada','rechazada')),
 creado timestamptz not null default now(),
 expira timestamptz);
create index on solicitudes (user_id);
create index on solicitudes (estado);

create table anuncios(
 id uuid primary key default gen_random_uuid(),
 solicitud_id uuid references solicitudes(id) on delete set null,
 cat cat_t not null,
 sub text check (sub is null or sub in ('carros','motos')),
 ciudad ciudad_t not null,
 titulo text not null check (char_length(titulo) between 5 and 70),
 descripcion text not null check (char_length(descripcion) between 10 and 400),
 precio integer check (precio is null or precio >= 0),
 tel text not null check (tel ~ '^9[0-9]{8}$'),
 wa text not null check (wa ~ '^9[0-9]{8}$'),
 fotos text[] not null default '{}' check (cardinality(fotos) <= 3 and fotos_validas(fotos)),
 destacado boolean not null default false,
 propio boolean not null default false,
 creado timestamptz not null default now(),
 expira timestamptz not null);
create index on anuncios (expira);

create table pagos(
 id uuid primary key default gen_random_uuid(),
 solicitud_id uuid references solicitudes(id) on delete set null,
 user_id uuid references profiles(id) on delete set null,
 titulo text not null,
 dias int not null,
 monto int not null,
 creado timestamptz not null default now());

create table historial(
 id bigint generated always as identity primary key,
 texto text not null,
 creado timestamptz not null default now());

create table config(
 clave text primary key,
 valor jsonb not null);
insert into config(clave, valor) values
 ('numero', '"910680644"'),
 ('precios', '{"3":5,"7":10,"10":15}');

-- ---------- 3. Funciones ----------
create function is_admin() returns boolean language sql stable security definer set search_path = public as $$
 select exists(select 1 from profiles where id = auth.uid() and role = 'admin') $$;

-- al crear una cuenta en Auth se crea su perfil (usuario y localización vienen del registro)
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
 insert into profiles(id, username, email, ciudad)
 values (new.id, trim(new.raw_user_meta_data->>'username'), new.email, new.raw_user_meta_data->>'ciudad');
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
 for each row execute function handle_new_user();

-- permite entrar con el nombre de usuario (devuelve el correo)
create function email_de_usuario(u text) returns text language sql stable security definer set search_path = public as $$
 select email from profiles where lower(username) = lower(trim(u)) limit 1 $$;

-- máximo 5 solicitudes en curso por cuenta (frena el spam)
create function limite_pendientes() returns trigger language plpgsql security definer set search_path = public as $$
begin
 if (select count(*) from solicitudes where user_id = new.user_id and estado in ('pendiente','aprobada')) >= 5 then
  raise exception 'Tienes demasiadas solicitudes en curso. Espera a que se resuelvan o cancela alguna.';
 end if;
 return new;
end $$;
create trigger t_limite before insert on solicitudes for each row execute function limite_pendientes();

-- publicar = anuncio + pago + estado + historial, todo en una sola transacción
create function publicar_solicitud(sid uuid, d int) returns void language plpgsql security definer set search_path = public as $$
declare r solicitudes; m int; e timestamptz;
begin
 if not is_admin() then raise exception 'No autorizado'; end if;
 if d not in (3,7,10) then raise exception 'Días no válidos'; end if;
 select * into r from solicitudes where id = sid for update;
 if not found then raise exception 'La solicitud no existe'; end if;
 if r.estado not in ('pendiente','aprobada') then raise exception 'La solicitud ya fue procesada'; end if;
 select (valor->>(d::text))::int into m from config where clave = 'precios';
 e := now() + make_interval(days => d);
 insert into anuncios(solicitud_id,cat,sub,ciudad,titulo,descripcion,precio,tel,wa,fotos,expira)
  values (r.id,r.cat,r.sub,r.ciudad,r.titulo,r.descripcion,r.precio,r.tel,r.wa,r.fotos,e);
 insert into pagos(solicitud_id,user_id,titulo,dias,monto) values (r.id,r.user_id,r.titulo,d,coalesce(m,0));
 update solicitudes set estado = 'publicada', dias = d, expira = e where id = r.id;
 insert into historial(texto) values ('Publicado ('||d||' días): '||r.titulo);
end $$;

-- eliminar una cuenta (y en cascada su perfil y solicitudes)
create function borrar_usuario(uid uuid) returns void language plpgsql security definer set search_path = public as $$
declare n text;
begin
 if not is_admin() then raise exception 'No autorizado'; end if;
 if uid = auth.uid() then raise exception 'No puedes eliminar tu propia cuenta'; end if;
 select username into n from profiles where id = uid;
 delete from auth.users where id = uid;
 insert into historial(texto) values ('Cuenta eliminada: '||coalesce(n,'?'));
end $$;

revoke all on function publicar_solicitud(uuid,int), borrar_usuario(uuid) from public, anon;
grant execute on function publicar_solicitud(uuid,int), borrar_usuario(uuid) to authenticated;
grant execute on function is_admin() to anon, authenticated;
grant execute on function email_de_usuario(text) to anon, authenticated;

-- ---------- 4. Seguridad (RLS) ----------
alter table profiles    enable row level security;
alter table solicitudes enable row level security;
alter table anuncios    enable row level security;
alter table pagos       enable row level security;
alter table historial   enable row level security;
alter table config      enable row level security;

-- profiles: cada quien ve el suyo; el admin ve todos. Nadie puede editar su rol.
create policy profiles_sel on profiles for select to authenticated using (id = auth.uid() or is_admin());

-- solicitudes: el cliente crea (solo "pendiente"), ve y cancela las suyas; el admin gestiona todas
create policy sol_sel on solicitudes for select to authenticated using (user_id = auth.uid() or is_admin());
create policy sol_ins on solicitudes for insert to authenticated
 with check (user_id = auth.uid() and estado = 'pendiente' and expira is null);
create policy sol_upd on solicitudes for update to authenticated using (is_admin()) with check (is_admin());
create policy sol_del on solicitudes for delete to authenticated
 using (is_admin() or (user_id = auth.uid() and estado in ('pendiente','aprobada')));

-- anuncios: todos ven los vigentes; solo el admin escribe
create policy anu_sel on anuncios for select to anon, authenticated using (expira > now() or is_admin());
create policy anu_ins on anuncios for insert to authenticated with check (is_admin());
create policy anu_upd on anuncios for update to authenticated using (is_admin()) with check (is_admin());
create policy anu_del on anuncios for delete to authenticated using (is_admin());

-- pagos e historial: solo admin (los pagos se registran únicamente con publicar_solicitud)
create policy pag_sel on pagos for select to authenticated using (is_admin());
create policy his_all on historial for all to authenticated using (is_admin()) with check (is_admin());

-- config: todos leen (precios y número de pago); solo el admin modifica
create policy cfg_sel on config for select to anon, authenticated using (true);
create policy cfg_ins on config for insert to authenticated with check (is_admin());
create policy cfg_upd on config for update to authenticated using (is_admin()) with check (is_admin());

-- ---------- 5. Fotos (Storage) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728,
 allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists fotos_lectura on storage.objects;
drop policy if exists fotos_subir on storage.objects;
drop policy if exists fotos_borrar on storage.objects;
create policy fotos_lectura on storage.objects for select using (bucket_id = 'fotos');
create policy fotos_subir on storage.objects for insert to authenticated
 with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy fotos_borrar on storage.objects for delete to authenticated using (bucket_id = 'fotos' and is_admin());

-- ---------- 6. Cuentas que ya existían en Authentication ----------
-- (reciben localización "Otros"; el admin puede borrarlas si son de prueba)
insert into profiles (id, username, email, ciudad)
select id, coalesce(nullif(trim(raw_user_meta_data->>'username'), ''), split_part(email,'@',1)), email, 'Otros'
from auth.users
on conflict do nothing;

-- ---------- 7. TU CUENTA DE ADMINISTRADOR ----------
-- 1) Crea tu cuenta desde el sitio (botón Publicar > Crear cuenta).
-- 2) Cambia el correo de abajo por el tuyo, QUITA los dos guiones del inicio y ejecuta SOLO esta línea:
-- update profiles set role = 'admin' where email = 'TU_CORREO@gmail.com';
