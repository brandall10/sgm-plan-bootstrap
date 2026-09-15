import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { diagnosticSummary } from "./candidate-loader.js";
import type { ResultRecord } from "../core/result.js";
import { SnapshotStore } from "./snapshot-store.js";

interface RecordResultOptions {
  packagePath?: string;
  storePath?: string;
  snapshotId: string;
  phaseId: string;
  activity: "implement" | "verify";
  resultId?: string;
  author?: string;
  codeRevision?: string;
  recordFile?: string;
  recordedAt?: string;
  illustrative: boolean;
}

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredValue(argv: string[], index: number, argument: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
  return value;
}

function parseArgs(argv: string[]): RecordResultOptions {
  let packagePath: string | undefined;
  let storePath: string | undefined;
  let snapshotId: string | undefined;
  let phaseId: string | undefined;
  let activity: RecordResultOptions["activity"] | undefined;
  let resultId: string | undefined;
  let author: string | undefined;
  let codeRevision: string | undefined;
  let recordFile: string | undefined;
  let recordedAt: string | undefined;
  let illustrative = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--package": packagePath = requiredValue(argv, index, argument); index += 1; break;
      case "--store": storePath = requiredValue(argv, index, argument); index += 1; break;
      case "--snapshot-id": snapshotId = requiredValue(argv, index, argument); index += 1; break;
      case "--phase":
      case "--phase-id": phaseId = requiredValue(argv, index, argument); index += 1; break;
      case "--activity":
        activity = requiredValue(argv, index, argument) as RecordResultOptions["activity"];
        index += 1;
        break;
      case "--record-id":
      case "--result-id": resultId = requiredValue(argv, index, argument); index += 1; break;
      case "--author": author = requiredValue(argv, index, argument); index += 1; break;
      case "--code-revision": codeRevision = requiredValue(argv, index, argument); index += 1; break;
      case "--record-file":
      case "--input-file": recordFile = requiredValue(argv, index, argument); index += 1; break;
      case "--recorded-at": recordedAt = requiredValue(argv, index, argument); index += 1; break;
      case "--illustrative": illustrative = true; break;
      default: throw new Error(`Unknown or incomplete argument '${argument}'.`);
    }
  }
  if (!packagePath && !storePath) throw new Error("Provide --package or --store.");
  if (!snapshotId) throw new Error("--snapshot-id is required; results never select the latest snapshot implicitly.");
  if (!phaseId) throw new Error("--phase is required.");
  if (activity !== "implement" && activity !== "verify") throw new Error("--activity must be implement or verify.");
  return {
    ...(packagePath ? { packagePath } : {}),
    ...(storePath ? { storePath } : {}),
    snapshotId,
    phaseId,
    activity,
    ...(resultId ? { resultId } : {}),
    ...(author ? { author } : {}),
    ...(codeRevision ? { codeRevision } : {}),
    ...(recordFile ? { recordFile } : {}),
    ...(recordedAt ? { recordedAt } : {}),
    illustrative,
  };
}

async function readRecordFile(path: string): Promise<RecordValue> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(resolve(path)));
  } catch {
    throw new Error(`Result record input '${path}' could not be read.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new Error(`Result record input '${path}' is not valid UTF-8 JSON.`);
  }
  if (!isRecord(parsed)) throw new Error(`Result record input '${path}' must contain a JSON object.`);
  return parsed;
}

function requiredRecordField(options: RecordResultOptions, input: RecordValue, key: "result_id" | "author" | "code_revision"): string {
  const optionValue = key === "result_id" ? options.resultId : key === "author" ? options.author : options.codeRevision;
  const inputValue = key === "result_id" ? input["result_id"] ?? input["record_id"] : input[key];
  const value = optionValue ?? (typeof inputValue === "string" ? inputValue : undefined);
  if (!value) throw new Error(`Provide --${key.replaceAll("_", "-")} or '${key}' in --record-file.`);
  return value;
}

async function buildRecord(options: RecordResultOptions, snapshotStore: SnapshotStore): Promise<ResultRecord> {
  const input = options.recordFile ? await readRecordFile(options.recordFile) : {};
  const snapshot = await snapshotStore.open(options.snapshotId);
  if (!snapshot.snapshot) throw new Error(snapshot.diagnostics.map((diagnostic) => diagnostic.message).join("; ") || `Snapshot '${options.snapshotId}' is unavailable.`);
  const resultId = requiredRecordField(options, input, "result_id");
  const author = requiredRecordField(options, input, "author");
  const codeRevision = requiredRecordField(options, input, "code_revision");
  return {
    ...input,
    format: input["format"] ?? "plan-package-result",
    format_version: input["format_version"] ?? "1",
    result_id: resultId,
    package_id: input["package_id"] ?? snapshot.snapshot.packageId,
    snapshot_id: options.snapshotId,
    phase_id: options.phaseId,
    activity: options.activity,
    author,
    recorded_at: options.recordedAt ?? (typeof input["recorded_at"] === "string" ? input["recorded_at"] : new Date().toISOString()),
    code_revision: codeRevision,
    environment: input["environment"] ?? {},
    related_item_ids: input["related_item_ids"] ?? [],
    intended_work: input["intended_work"] ?? [],
    observed_facts: input["observed_facts"] ?? [],
    inferences: input["inferences"] ?? [],
    unverified_claims: input["unverified_claims"] ?? [],
    produced_interfaces: input["produced_interfaces"] ?? [],
    deviations: input["deviations"] ?? [],
    unresolved_findings: input["unresolved_findings"] ?? [],
    evidence: input["evidence"] ?? [],
    delivery_facts: input["delivery_facts"] ?? { review_status: "not-reviewed", integration_status: "not-integrated" },
    continuation_notes: input["continuation_notes"] ?? [],
    supersedes: input["supersedes"] ?? [],
    illustrative: options.illustrative || input["illustrative"] === true,
  } as ResultRecord;
}

const options = parseArgs(process.argv.slice(2));
const storeRoot = options.storePath
  ? resolve(options.storePath)
  : join(resolve(options.packagePath ?? "."), ".plan-package");
const store = new SnapshotStore({ root: storeRoot });
const record = await buildRecord(options, store);
const result = await store.recordResult(record);
for (const line of diagnosticSummary(result.diagnostics)) console.error(line);
if (!result.result) {
  process.exitCode = 1;
} else {
  console.log(`${result.idempotent ? "Result already recorded" : "Recorded result"} ${result.result.result_id} for ${result.result.phase_id}/${result.result.activity}${result.result.illustrative ? " (illustrative)" : ""}.`);
}
