/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "domains-must-not-import-app",
      severity: "error",
      from: { path: "^apps/api-ts/src/domains/" },
      to: { path: "^apps/api-ts/src/app/" },
    },
    {
      name: "lib-must-not-import-domains",
      severity: "error",
      from: { path: "^apps/api-ts/src/lib/" },
      to: { path: "^apps/api-ts/src/domains/" },
    },
    {
      name: "lib-must-not-import-app",
      severity: "error",
      from: { path: "^apps/api-ts/src/lib/" },
      to: { path: "^apps/api-ts/src/app/" },
    },
    {
      name: "provider-services-must-not-import-app",
      severity: "error",
      from: { path: "^apps/api-ts/src/domains/providers/services/" },
      to: { path: "^apps/api-ts/src/app/" },
    },
    {
      name: "providers-must-not-import-threads-domain",
      severity: "error",
      from: {
        path: "^apps/api-ts/src/domains/providers/",
        pathNot: "\\.test\\.ts$",
      },
      to: {
        path: "^apps/api-ts/src/domains/threads/",
        pathNot: "^apps/api-ts/src/domains/threads/query\\.ts$",
      },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    exclude: {
      path: "(^|/)(dist|dist-electron|coverage|node_modules)/",
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    },
    reporterOptions: {
      dot: {
        collapsePattern:
          "node_modules/[^/]+|packages/[^/]+|apps/api-ts/src/(app|domains|lib|platform)",
      },
    },
  },
};
