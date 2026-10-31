// Offline JS-only Prisma generation. Uses a regular stdin file for compatibility
// with managed execution environments whose child-process pipes close early.
// The npm script invokes the official generator; verify-client checks its output.
const { getDMMF, getConfig } = require("@prisma/internals");
const fs = require("node:fs");
const path = require("node:path");
async function main() {
  const schemaPath = path.resolve("prisma/schema.prisma");
  const datamodel = fs.readFileSync(schemaPath, "utf8");
  const config = await getConfig({ datamodel, ignoreEnvVarErrors: true });
  const dmmf = await getDMMF({ datamodel });
  const generator = config.generators[0];
  generator.output = {
    value: path.resolve("node_modules/.prisma/client"),
    fromEnvVar: null,
  };
  generator.isCustomOutput = true;
  const options = {
    datamodel,
    datasources: config.datasources,
    generator,
    dmmf,
    otherGenerators: [],
    schemaPath,
    version: require("@prisma/engines-version").enginesVersion,
    binaryPaths: {},
    noEngine: false,
    allowNoModels: false,
    envPaths: { rootEnvPath: null, schemaEnvPath: null },
  };
  fs.mkdirSync("work", { recursive: true });
  fs.writeFileSync(
    "work/prisma-generate.json",
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "generate",
      params: options,
    }) + "\n",
    { mode: 0o600 },
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
