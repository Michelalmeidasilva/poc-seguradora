import { createChatbot } from './compose';
import { loadConfig } from './config';

const loaded = loadConfig(process.env);
if (!loaded.ok) {
  console.error(`Invalid configuration:\n${loaded.error.map((e) => `- ${e}`).join('\n')}`);
  process.exit(1);
}
const config = loaded.value;

const { app, dialogs } = await createChatbot(config);

const sweeper = setInterval(() => {
  const removed = dialogs.sweep();
  if (removed > 0) app.log.info({ removed }, 'swept idle dialogs');
}, 60_000);
sweeper.unref();

let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
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

try {
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (error) {
  app.log.error(
    { err: { name: error instanceof Error ? error.name : 'Error' } },
    'failed to start',
  );
  process.exit(1);
}
