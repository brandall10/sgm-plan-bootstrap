import { resolve } from "node:path";

import { diagnosticSummary } from "./candidate-loader.js";
import { startRuntime } from "./runtime.js";

interface CliOptions {
  packagePath: string;
  repositoryPath?: string;
  host?: string;
  port?: number;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { packagePath: "examples/offline-recovery" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if ((argument === "--package" || argument === "-p") && value) {
      options.packagePath = value;
      index += 1;
    } else if (argument === "--repository" && value) {
      options.repositoryPath = value;
      index += 1;
    } else if (argument === "--host" && value) {
      options.host = value;
      index += 1;
    } else if (argument === "--port" && value) {
      const port = Number(value);
      if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid port '${value}'.`);
      options.port = port;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument '${argument}'.`);
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const runtime = await startRuntime({
  packageRoot: resolve(process.cwd(), options.packagePath),
  ...(options.repositoryPath ? { repositoryRoot: resolve(process.cwd(), options.repositoryPath) } : { repositoryRoot: process.cwd() }),
  ...(options.host ? { host: options.host } : {}),
  ...(options.port !== undefined ? { port: options.port } : {}),
  serveViewer: true,
  viewerRoot: process.cwd(),
});

console.log(`Plan Package viewer listening at http://${runtime.host}:${runtime.port}`);
const state = runtime.store.getState();
if (state.currentCandidateId) {
  console.log(`Loaded ${state.packageId} revision ${state.currentRevision} as ${state.currentCandidateId}`);
}
if (state.diagnostics.length > 0) {
  for (const line of diagnosticSummary(state.diagnostics)) console.warn(line);
}
