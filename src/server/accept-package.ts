import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { diagnosticSummary } from "./candidate-loader.js";
import { SnapshotStore } from "./snapshot-store.js";
import type { AcceptanceRecord } from "../core/snapshot.js";

interface AcceptOptions {
  packagePath?: string;
  storePath?: string;
  snapshotId: string;
  recordId: string;
  actor: string;
  source: string;
  instructionFile: string;
  illustrative: boolean;
  recordedAt?: string;
}

function requiredValue(argv: string[], index: number, argument: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
  return value;
}

function parseArgs(argv: string[]): AcceptOptions {
  let packagePath: string | undefined;
  let storePath: string | undefined;
  let snapshotId: string | undefined;
  let recordId: string | undefined;
  let actor: string | undefined;
  let source: string | undefined;
  let instructionFile: string | undefined;
  let recordedAt: string | undefined;
  let illustrative = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--package": packagePath = requiredValue(argv, index, argument); index += 1; break;
      case "--store": storePath = requiredValue(argv, index, argument); index += 1; break;
      case "--snapshot-id": snapshotId = requiredValue(argv, index, argument); index += 1; break;
      case "--record-id": recordId = requiredValue(argv, index, argument); index += 1; break;
      case "--actor": actor = requiredValue(argv, index, argument); index += 1; break;
      case "--source": source = requiredValue(argv, index, argument); index += 1; break;
      case "--instruction-file": instructionFile = requiredValue(argv, index, argument); index += 1; break;
      case "--recorded-at": recordedAt = requiredValue(argv, index, argument); index += 1; break;
      case "--illustrative": illustrative = true; break;
      default: throw new Error(`Unknown or incomplete argument '${argument}'.`);
    }
  }
  if (!storePath && !packagePath) throw new Error("Provide --package or --store.");
  if (!snapshotId) throw new Error("--snapshot-id is required; acceptance never selects the latest snapshot implicitly.");
  if (!recordId) throw new Error("--record-id is required.");
  if (!actor) throw new Error("--actor is required.");
  if (!source) throw new Error("--source is required.");
  if (!instructionFile) throw new Error("--instruction-file is required.");
  return {
    ...(packagePath ? { packagePath } : {}),
    ...(storePath ? { storePath } : {}),
    snapshotId,
    recordId,
    actor,
    source,
    instructionFile,
    illustrative,
    ...(recordedAt ? { recordedAt } : {}),
  };
}

const options = parseArgs(process.argv.slice(2));
const storeRoot = options.storePath
  ? resolve(options.storePath)
  : join(resolve(options.packagePath ?? "."), ".plan-package");
const instructionBytes = new Uint8Array(await readFile(resolve(options.instructionFile)));
let instruction: string;
try {
  instruction = new TextDecoder("utf-8", { fatal: true }).decode(instructionBytes);
} catch {
  throw new Error(`Instruction file '${options.instructionFile}' is not valid UTF-8.`);
}
const record: AcceptanceRecord = {
  format: "plan-package-acceptance",
  format_version: "1",
  record_id: options.recordId,
  package_id: "pending-validation",
  snapshot_id: options.snapshotId,
  instruction,
  source: options.source,
  actor: options.actor,
  recorded_at: options.recordedAt ?? new Date().toISOString(),
  illustrative: options.illustrative,
};

const store = new SnapshotStore({ root: storeRoot });
const snapshot = await store.open(options.snapshotId);
if (!snapshot.snapshot) {
  for (const line of diagnosticSummary(snapshot.diagnostics)) console.error(line);
  process.exitCode = 1;
} else {
  record.package_id = snapshot.snapshot.packageId;
  const result = await store.recordAcceptance(record);
  for (const line of diagnosticSummary(result.diagnostics)) console.error(line);
  if (!result.record) {
    process.exitCode = 1;
  } else {
    console.log(`${result.idempotent ? "Acceptance already recorded" : "Recorded acceptance"} ${result.record.record_id} for snapshot ${result.record.snapshot_id}${result.record.illustrative ? " (illustrative)" : ""}.`);
  }
}
