import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import cron from 'node-cron';
import { createStore } from './storage/store.js';
import { createApp } from './http/app.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const databasePath = path.resolve(process.env.DAYLA_DB_PATH ?? 'var/dayla.sqlite');
mkdirSync(path.dirname(databasePath), { recursive: true });
const store = createStore(databasePath, () => new Date(), { mode: 'live' });
const scheduler = cron.schedule('*/5 * * * * *', () => store.tick());
store.schedulerRunning = true;
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const app = createApp(store, { staticDir: path.resolve('dist/client') });
const server = app.listen(port, '127.0.0.1', () => {
  console.info(`Dayla: http://127.0.0.1:${port}`);
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  scheduler.stop();
  store.schedulerRunning = false;
  server.close(() => {
    store.close();
    process.exit(0);
  });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
