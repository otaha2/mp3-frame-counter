/** Process entry point: build the app, start listening, shut down cleanly. */

import { buildApp } from './http/app';
import { loadConfig } from './config';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = buildApp(config, { logger: true });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      app.log.info({ signal }, 'shutting down');
      void app.close().then(() => process.exit(0));
    });
  }

  await app.listen({ port: config.port, host: config.host });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
