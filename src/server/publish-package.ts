import { resolve } from "node:path";

import { diagnosticSummary } from "./candidate-loader.js";
import { publishPackage } from "./publication.js";

const argv = process.argv.slice(2);
const packageIndex = argv.findIndex((argument) => argument === "--package" || argument === "-p");
const packageArgument = packageIndex >= 0 ? argv[packageIndex + 1] : "examples/offline-recovery";
if (!packageArgument) throw new Error("--package requires a directory.");
const repositoryIndex = argv.findIndex((argument) => argument === "--repository");
const repositoryArgument = repositoryIndex >= 0 ? argv[repositoryIndex + 1] : undefined;

const result = await publishPackage({
  packageRoot: resolve(process.cwd(), packageArgument),
  ...(repositoryArgument ? { repositoryRoot: resolve(process.cwd(), repositoryArgument) } : { repositoryRoot: process.cwd() }),
});
for (const line of diagnosticSummary(result.diagnostics)) console.error(line);
if (!result.published) {
  process.exitCode = 1;
} else {
  console.log(`Published ${result.manifestPath} at author revision ${result.revision} (${result.candidate?.contentId}).`);
}
