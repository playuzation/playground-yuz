import { existsSync, mkdirSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { createApp } from '@playground/api';
import { SqliteStore } from './sqlite-store.ts';

const port = Number(process.env.PORT ?? 3000);
const dbPath = process.env.DB_PATH ?? 'data/app.db';
const webDist = fileURLToPath(new URL('../../web/dist/', import.meta.url));

if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
if (!existsSync(webDist)) console.warn('web 빌드 결과물이 없습니다. 먼저 `npm run build -w @playground/web`를 실행하세요.');

const app = new Hono();
app.route('/', createApp({ store: new SqliteStore(dbPath) }));
app.use('/*', serveStatic({ root: relative(process.cwd(), webDist) }));

serve({ fetch: app.fetch, port }, (info) => console.log(`http://localhost:${info.port} (DB: ${dbPath})`));
