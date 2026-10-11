// Standalone fake of the internal services (cotação, apólice, sinistro) for docker-compose and
// for the Cloud Run `fake-services` service while the real svc-* do not exist. It serves the
// same contract-conformant fake the chatbot tests use. Run with Node's TypeScript type
// stripping (no build step, no dependency): node --experimental-strip-types main.ts
import { startFakeServices } from '../../apps/chatbot/src/test/fake-services.ts';

const port = Number(process.env.PORT ?? 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`fake-services: invalid PORT ${process.env.PORT}`);
  process.exit(1);
}

// `record: false`: a long-running server must not keep every request in memory.
const fake = await startFakeServices({ port, host: '0.0.0.0', record: false });
console.log(`fake-services listening on ${fake.url}`);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void fake.close().then(() => process.exit(0));
  });
}
