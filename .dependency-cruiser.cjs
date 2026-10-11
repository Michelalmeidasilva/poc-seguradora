/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      severity: 'error',
      comment: 'domain must not depend on application or infra',
      from: { path: '^apps/[^/]+/src/domain/' },
      to: { path: '^apps/[^/]+/src/(application|infra)/' },
    },
    {
      name: 'domain-has-no-frameworks',
      severity: 'error',
      comment: 'domain must not import frameworks or I/O libraries',
      from: { path: '^apps/[^/]+/src/domain/' },
      to: { path: 'node_modules/(fastify|@fastify|pino|jose)/' },
    },
    {
      name: 'application-not-on-infra',
      severity: 'error',
      comment: 'application defines ports; infra implements them',
      from: { path: '^apps/[^/]+/src/application/' },
      to: { path: '^apps/[^/]+/src/infra/' },
    },
    {
      name: 'web-transport-is-framework-free',
      severity: 'error',
      comment: 'transport and the chat model/reducer are plain TypeScript: no React',
      from: { path: '^apps/web/src/(transport/|chat/(model|reducer|persistence|tab-lock)\\.ts$)' },
      to: { path: 'node_modules/(react|react-dom)/' },
    },
    {
      name: 'web-ui-is-a-leaf',
      severity: 'error',
      comment: 'ui must not depend on chat, renderers or transport',
      from: { path: '^apps/web/src/ui/' },
      to: { path: '^apps/web/src/(chat|renderers|transport)/' },
    },
    {
      name: 'web-renderers-do-not-talk-to-the-network',
      severity: 'error',
      comment: 'renderers receive callbacks; they never import transport',
      from: { path: '^apps/web/src/renderers/' },
      to: { path: '^apps/web/src/transport/' },
    },
    {
      name: 'web-transport-does-not-know-the-ui',
      severity: 'error',
      comment: 'transport must not import chat, renderers or ui',
      from: { path: '^apps/web/src/transport/' },
      to: { path: '^apps/web/src/(chat|renderers|ui)/' },
    },
    {
      name: 'web-flows-core-is-framework-free',
      severity: 'error',
      comment: 'flow schema, expressions and runtime are plain TypeScript: no React',
      from: { path: '^apps/web/src/flows/(schema|expr|runtime)\\.ts$' },
      to: { path: 'node_modules/(react|react-dom)/' },
    },
    {
      name: 'web-flows-is-self-contained',
      severity: 'error',
      comment:
        'flows may use ui, renderers/format-text and renderers/safe-urls; nothing else outside flows',
      from: { path: '^apps/web/src/flows/', pathNot: '\\.test\\.tsx?$' },
      to: {
        path: '^apps/web/src/(chat|app|transport|renderers)/',
        pathNot: '^apps/web/src/renderers/(format-text|safe-urls)\\.ts$',
      },
    },
    {
      name: 'web-flows-only-through-index',
      severity: 'error',
      comment: 'chat and app reach flows only through flows/index.ts',
      from: { path: '^apps/web/src/(chat|app)/' },
      to: { path: '^apps/web/src/flows/', pathNot: '^apps/web/src/flows/index\\.ts$' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|coverage)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
  },
};
