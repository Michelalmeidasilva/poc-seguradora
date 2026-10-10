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
