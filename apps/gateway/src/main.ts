import { createGateway } from './compose';
import { loadConfig } from './config';

const loaded = loadConfig(process.env);
if (!loaded.ok) {
  console.error(`Invalid configuration:\n${loaded.error.map((e) => `- ${e}`).join('\n')}`);
  process.exit(1);
}
const config = loaded.value;

const { app, registry } = await createGateway(config);

const sweeper = setInterval(() => {
  const removed = registry.sweep();
  if (removed > 0) app.log.info({ removed }, 'swept idle sessions');
}, 60_000);
sweeper.unref();

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    clearInterval(sweeper);
    app.close().then(
      () => process.exit(0),
      (error: unknown) => {
        app.log.error({ err: error }, 'shutdown failed');
        process.exit(1);
      },
    );
  });
}

await app.listen({ port: config.PORT, host: config.HOST });
