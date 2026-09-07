import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

test('SQL: migración, privacidad, cupo, versiones y publicación atómica', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
      grant usage on schema auth, public to anon, authenticated, service_role;
    `)
    for (const file of ['001_altars_table.sql', '005_altar_status.sql', '006_admin_access.sql', '008_altars_select_authenticated.sql']) await db.exec(readFileSync(`supabase/${file}`, 'utf8'))
    await db.exec('alter table public.altars add column reported_count integer default 0; drop policy altars_insert_anon on public.altars;')
    for (const file of ['012_altar_edit_token.sql', '016_user_altars.sql']) await db.exec(readFileSync(`supabase/${file}`, 'utf8'))
    const owner = '11111111-1111-4111-8111-111111111111'
    const other = '22222222-2222-4222-8222-222222222222'
    await db.query('insert into auth.users values ($1), ($2)', [owner, other])
    await db.query("insert into public.altars(slug,name,objects,owner_id) values ('legacy','Publicado antes','[]',$1)", [owner])
    await db.exec(readFileSync('supabase/017_private_drafts.sql', 'utf8'))
    const content = { name: 'Privado', objects: [], photo: 'data:image/jpeg;base64,/9j/', clothColor: '#ffffff' }
    const commit = (slug, user, revision, data, publish = false) => db.query('select public.commit_altar_draft($1,$2,$3,$4,$5,$6) as result', [slug, user, revision, data, publish, publish ? 'https://example.test/public.jpg' : null])
    await commit('private', owner, 0, content)
    await db.exec('grant select on public.altar_drafts to anon, authenticated; set role anon;')
    assert.deepEqual((await db.query('select slug from public.altars order by slug')).rows, [{ slug: 'legacy' }])
    assert.equal((await db.query('select * from public.altar_drafts')).rows.length, 0)
    await assert.rejects(db.query('select public.my_altars()'), /permission denied/)
    await assert.rejects(commit('bad', owner, 0, content), /permission denied/)
    await db.exec('reset role; set role authenticated;')
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [other])
    assert.equal((await db.query('select * from public.my_altars()')).rows.length, 0)
    assert.equal((await db.query('select slug from public.altars')).rows.length, 1)
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [owner])
    const own = (await db.query('select * from public.my_altars()')).rows
    assert.equal(own.length, 2)
    assert.equal(own.find(a => a.slug === 'private').photo_url, content.photo)
    assert.equal(own.find(a => a.slug === 'legacy').revision, 1)
    assert.equal((await db.query('select * from public.altar_drafts')).rows.length, 0)
    await db.exec('reset role;')
    await assert.rejects(commit('private', other, 1, content), /Sin permiso/)
    await commit('private', owner, 1, { ...content, name: 'Publicado' }, true)
    await commit('private', owner, 2, { ...content, name: 'Cambios privados' })
    assert.equal((await db.query("select name from public.altars where slug='private'")).rows[0].name, 'Publicado')
    await assert.rejects(commit('private', owner, 2, { ...content, name: 'Sobrescritura' }, true), /más recientes/)
    assert.equal((await db.query("select name from public.altars where slug='private'")).rows[0].name, 'Publicado')
    await db.exec("update public.altars set status='hidden',reported_count=5 where slug='private'")
    await commit('private', owner, 3, { ...content, name: 'Actualización publicada' }, true)
    const published = (await db.query("select name,status,reported_count from public.altars where slug='private'")).rows[0]
    assert.equal(published.name, 'Actualización publicada')
    assert.equal(published.status, 'hidden')
    assert.equal(published.reported_count, 5)
    await commit('third', owner, 0, content)
    await assert.rejects(commit('fourth', owner, 0, content), /3 altares/)
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [owner])
    await db.query("select public.delete_my_altar('private')")
    assert.equal((await db.query("select * from public.altar_drafts where slug='private'")).rows.length, 0)
    await commit('replacement', owner, 0, content)
  } finally { await db.close() }
})
