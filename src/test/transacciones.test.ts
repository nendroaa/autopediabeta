// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const conductor = '10000000-0000-0000-0000-000000000001';
const mecanico = '10000000-0000-0000-0000-000000000002';
const otroMecanico = '10000000-0000-0000-0000-000000000003';
const otroConductor = '10000000-0000-0000-0000-000000000004';
const sinVerificar = '10000000-0000-0000-0000-000000000005';
let db: PGlite;
let publicacion: string;
async function identidad(id: string) {
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id]);
}
async function fila() {
  const result = await db.query<Record<string, unknown>>('SELECT * FROM public.transacciones WHERE publicacion_id = $1', [publicacion]);
  return result.rows[0];
}
async function responder(id = mecanico) {
  await identidad(id);
  const result = await db.query<{ id: string }>('INSERT INTO public.respuestas (publicacion_id, diagnostico) VALUES ($1, $2) RETURNING id', [publicacion, 'Revisar pastillas y discos de freno.']);
  return result.rows[0]?.id;
}
describe('Registro de transacciones: reglas reales de PostgreSQL', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, raw_user_meta_data jsonb);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;`);
    await db.exec(readFileSync('drizzle/migrations/0000_migration.sql', 'utf8'));
    await db.exec(readFileSync('drizzle/migrations/0001_transaction_lifecycle.sql', 'utf8'));
    for (const [id, rol] of [[conductor, 'conductor'], [mecanico, 'mecanico'], [otroMecanico, 'mecanico'], [otroConductor, 'conductor'], [sinVerificar, 'mecanico']]) {
      await db.query('INSERT INTO auth.users VALUES ($1, $2)', [id, JSON.stringify({ rol })]);
    }
    await db.query('UPDATE public.perfiles SET verificado = true WHERE id IN ($1, $2)', [mecanico, otroMecanico]);
  }, 30000);
  afterAll(async () => { await db.close(); });
  beforeEach(async () => {
    await db.exec('BEGIN');
    await identidad(conductor);
    const result = await db.query<{ id: string }>("INSERT INTO public.publicaciones (marca, modelo, anio, sintoma) VALUES ('Toyota', 'Yaris', 2018, 'Ruido al frenar') RETURNING id");
    publicacion = result.rows[0]?.id ?? '';
  });
  afterEach(async () => { await db.exec('ROLLBACK'); });
  it('al publicar registra publicada, ninguno, precio 0, comisión 0 y participantes pendientes nulos', async () => {
    expect(await fila()).toMatchObject({ publicacion_id: publicacion, conductor_id: conductor, estado: 'publicada', pagador: 'ninguno', precio: 0, comision: 0, mecanico_id: null, respuesta_id: null });
  });
  it('solo permite una transacción por publicación', async () => {
    await expect(db.query('INSERT INTO public.transacciones (publicacion_id, conductor_id) VALUES ($1, $2)', [publicacion, conductor])).rejects.toThrow(/unique/i);
  });
  it('la primera respuesta verificada registra al mecánico y pasa a respondida', async () => {
    await responder();
    expect(await fila()).toMatchObject({ estado: 'respondida', mecanico_id: mecanico, respuesta_id: null });
  });
  it('respuestas posteriores conservan una sola fila y al primer mecánico', async () => {
    await responder(); await responder(otroMecanico);
    expect(await fila()).toMatchObject({ estado: 'respondida', mecanico_id: mecanico });
    expect((await db.query('SELECT id FROM public.transacciones WHERE publicacion_id = $1', [publicacion])).rows).toHaveLength(1);
  });
  it('un mecánico sin verificar no puede responder', async () => {
    await expect(responder(sinVerificar)).rejects.toThrow(/verificado/);
  });
  it('confirmar cualquier respuesta guarda sus IDs y confirma ambas filas', async () => {
    await responder(); const respuesta = await responder(otroMecanico);
    await identidad(conductor);
    await db.query('SELECT public.confirmar_solucion($1)', [respuesta]);
    expect(await fila()).toMatchObject({ estado: 'confirmada', respuesta_id: respuesta, mecanico_id: otroMecanico });
    expect((await db.query('SELECT estado FROM public.publicaciones WHERE id = $1', [publicacion])).rows[0]).toEqual({ estado: 'confirmada' });
  });
  it('una transacción confirmada no se puede confirmar otra vez', async () => {
    const respuesta = await responder(); await identidad(conductor);
    await db.query('SELECT public.confirmar_solucion($1)', [respuesta]);
    await expect(db.query('SELECT public.confirmar_solucion($1)', [respuesta])).rejects.toThrow(/ya está confirmada/);
  });
  it('otro conductor no puede confirmar', async () => {
    const respuesta = await responder(); await identidad(otroConductor);
    await expect(db.query('SELECT public.confirmar_solucion($1)', [respuesta])).rejects.toThrow(/Solo el conductor/);
  });
  it('el conductor solo ve sus filas y el mecánico solo las asignadas a él', async () => {
    await responder();
    await db.exec('SET LOCAL ROLE authenticated');
    for (const [id, count] of [[conductor, 1], [mecanico, 1], [otroConductor, 0], [otroMecanico, 0]] as const) {
      await identidad(id);
      expect((await db.query('SELECT id FROM public.transacciones WHERE publicacion_id = $1', [publicacion])).rows).toHaveLength(count);
    }
  });
  it('ningún usuario puede borrar una transacción, ni siquiera por cascada', async () => {
    await expect(db.query('DELETE FROM public.publicaciones WHERE id = $1', [publicacion])).rejects.toThrow(/no se pueden borrar/);
  });
  it('authenticated no tiene permisos de escritura y anon no puede leer', async () => {
    const { rows } = await db.query("SELECT has_table_privilege('authenticated', 'public.transacciones', 'DELETE') AS borrar, has_table_privilege('authenticated', 'public.transacciones', 'UPDATE') AS editar, has_table_privilege('authenticated', 'public.transacciones', 'INSERT') AS crear, has_table_privilege('anon', 'public.transacciones', 'SELECT') AS anon");
    expect(rows[0]).toEqual({ borrar: false, editar: false, crear: false, anon: false });
  });
});