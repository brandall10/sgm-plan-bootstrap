import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

import {
  compareSnapshots,
  type SnapshotComparison,
} from "../core/compare.js";
import {
  selectContext,
  type ContextPrerequisiteResult,
  type ContextReadinessBlocker,
  type ContextSelection,
} from "../core/context.js";
import { errorDiagnostic, warningDiagnostic, type Diagnostic } from "../core/diagnostics.js";
import {
  collectAddressableIds,
  isValidIdentifier,
  type AcceptanceCriterion,
  type ContextActivity,
  type Decision,
  type PackageAsset,
  type PackageFile,
  type Phase,
  type PhaseTask,
  type PlanPackage,
  type Question,
  type Reference,
} from "../core/package.js";
import { resultEvidenceStatus, type ResultEvidence, type ResultFinding, type ResultInterface, type ResultRecord, type ResultStatement } from "../core/result.js";
import type { AcceptanceRecord } from "../core/snapshot.js";
import { snapshotIdentityInput, type SnapshotDescriptor } from "../core/snapshot.js";
import { loadCandidate, type CandidateLoadResult } from "./candidate-loader.js";
import { SnapshotStore, type ResultHistoryResult, type StoredSnapshot } from "./snapshot-store.js";
import {
  PLAN_CLI_RESPONSE_FORMAT,
  PLAN_CLI_RESPONSE_VERSION,
  serializePlanCliResponse,
  validatePlanCliResponse,
  type PlanCliAcceptanceStatus,
  type PlanCliDiagnostic,
  type PlanCliReadinessState,
  type PlanCliResponse,
  type PlanCliResponseFormat,
  type PlanCliResponseOperation,
} from "./plan-cli-response.js";

export type PlanCommand = "current" | "context" | "expand";

export interface PlanCliOptions {
  command: PlanCommand;
  packagePath?: string;
  storePath?: string;
  repositoryPath?: string;
  snapshotId?: string;
  phaseId?: string;
  activity?: ContextActivity;
  refs: string[];
  maxChars?: number;
  compareDraft: boolean;
  /** JSON is the machine-facing default; Markdown is an explicit renderer. */
  format?: PlanCliResponseFormat;
}

export interface PlanCliParseResult {
  options: PlanCliOptions | null;
  error: string | null;
  help: boolean;
  helpCommand?: PlanCommand;
}

export interface PlanCliRunResult {
  output: string;
  exitCode: 0 | 1 | 2;
  response: PlanCliResponse;
}

interface DraftInfo {
  packageId: string | null;
  revision: number | null;
  contentId: string | null;
  diagnostics: Diagnostic[];
}

interface DraftComparison {
  status: "unavailable" | "same" | "newer" | "changed";
  revision: number | null;
  contentId: string | null;
  diagnostics: Diagnostic[];
  comparison?: SnapshotComparison;
}

interface SnapshotContext {
  store: SnapshotStore;
  snapshot: StoredSnapshot;
  packageHint: DraftInfo;
  acceptances: AcceptanceRecord[];
  resultHistory: ResultHistoryResult;
  diagnostics: Diagnostic[];
}

interface SnapshotContextLoadResult {
  context: SnapshotContext | null;
  diagnostics: Diagnostic[];
}

interface PackageHistory {
  store: SnapshotStore;
  packageId: string | null;
  packageHint: DraftInfo;
  snapshots: StoredSnapshot[];
  acceptances: AcceptanceRecord[];
  resultHistory: ResultHistoryResult;
  diagnostics: Diagnostic[];
}

interface ExpansionRequest {
  id: string;
  sourceSnapshotId?: string;
  sourcePackageId?: string;
  raw: string;
}

interface ExpansionRenderResult {
  text: string;
  unavailable: boolean;
}

interface ExpansionResolution {
  items: Array<{ request: ExpansionRequest; rendered: ExpansionRenderResult }>;
  diagnostics: Diagnostic[];
  unavailable: boolean;
}

const BASE_FLAGS = new Set(["--package", "-p", "--store", "--repository", "--snapshot", "--snapshot-id", "--format"]);
const CONTEXT_FLAGS = new Set(["--phase", "--phase-id", "--activity", "--max-chars", "--char-budget", "--budget", "--compare-draft"]);
const EXPAND_FLAGS = new Set(["--refs", "--ref", "--max-chars", "--char-budget", "--budget"]);
const CURRENT_FLAGS = new Set(["--compare-draft"]);

function usage(command?: PlanCommand): string {
  if (command === "current") {
    return "Usage: plan current --package PATH [--snapshot SNAPSHOT_ID] [--format json|markdown] [--compare-draft]";
  }
  if (command === "context") {
    return "Usage: plan context --package PATH --snapshot SNAPSHOT_ID --phase PHASE_ID --activity implement|verify [--format json|markdown] [--max-chars N] [--compare-draft]";
  }
  if (command === "expand") {
    return "Usage: plan expand --package PATH --snapshot SNAPSHOT_ID --refs REF_ID... [--format json|markdown] [--max-chars N]";
  }
  return [
    "Usage:",
    "  plan current --package PATH [--snapshot SNAPSHOT_ID] [--format json|markdown] [--compare-draft]",
    "  plan context --package PATH --snapshot SNAPSHOT_ID --phase PHASE_ID --activity implement|verify [--format json|markdown] [--max-chars N] [--compare-draft]",
    "  plan expand --package PATH --snapshot SNAPSHOT_ID --refs REF_ID... [--format json|markdown] [--max-chars N]",
    "",
    "Use --store STORE_PATH instead of --package when the working package root is unavailable.",
  ].join("\n");
}

function requiredValue(argv: readonly string[], index: number, argument: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) throw new Error(`${argument} requires a value.`);
  return value;
}

function positiveInteger(value: string, argument: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${argument} requires a positive integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${argument} is too large.`);
  return parsed;
}

function addOnce<T>(current: T | undefined, next: T, argument: string): T {
  if (current !== undefined) throw new Error(`${argument} may only be provided once.`);
  return next;
}

/** Parse the package-local plan command without accepting viewer/runtime flags. */
export function parsePlanCliArgs(argv: readonly string[]): PlanCliParseResult {
  if (argv.length === 0) return { options: null, error: "A command is required (current, context, or expand).", help: false };
  if (argv.includes("--help") || argv.includes("-h")) {
    const command = argv[0];
    const helpCommand = command === "current" || command === "context" || command === "expand" ? command : undefined;
    return { options: null, error: null, help: true, ...(helpCommand ? { helpCommand } : {}) };
  }

  const command = argv[0];
  if (command !== "current" && command !== "context" && command !== "expand") {
    return { options: null, error: `Unknown command '${command}'.`, help: false };
  }

  let packagePath: string | undefined;
  let storePath: string | undefined;
  let repositoryPath: string | undefined;
  let snapshotId: string | undefined;
  let phaseId: string | undefined;
  let activity: ContextActivity | undefined;
  let maxChars: number | undefined;
  let compareDraft = false;
  let compareDraftSeen = false;
  let format: PlanCliResponseFormat = "json";
  let formatSeen = false;
  const refs: string[] = [];

  try {
    for (let index = 1; index < argv.length; index += 1) {
      const argument = argv[index] ?? "";
      const allowed = BASE_FLAGS.has(argument)
        || (command === "current" && CURRENT_FLAGS.has(argument))
        || (command === "context" && CONTEXT_FLAGS.has(argument))
        || (command === "expand" && EXPAND_FLAGS.has(argument));
      if (!allowed) throw new Error(`Unknown or incomplete argument '${argument}'.`);
      switch (argument) {
        case "--package":
        case "-p": packagePath = addOnce(packagePath, requiredValue(argv, index, argument), argument); index += 1; break;
        case "--store": storePath = addOnce(storePath, requiredValue(argv, index, argument), argument); index += 1; break;
        case "--repository": repositoryPath = addOnce(repositoryPath, requiredValue(argv, index, argument), argument); index += 1; break;
        case "--snapshot":
        case "--snapshot-id": snapshotId = addOnce(snapshotId, requiredValue(argv, index, argument), argument); index += 1; break;
        case "--format": {
          if (formatSeen) throw new Error("--format may only be provided once.");
          const value = requiredValue(argv, index, argument);
          if (value !== "json" && value !== "markdown") throw new Error("--format must be json or markdown.");
          format = value;
          formatSeen = true;
          index += 1;
          break;
        }
        case "--phase":
        case "--phase-id": phaseId = addOnce(phaseId, requiredValue(argv, index, argument), argument); index += 1; break;
        case "--activity": {
          const value = requiredValue(argv, index, argument);
          if (value !== "implement" && value !== "verify") throw new Error("--activity must be implement or verify.");
          activity = addOnce(activity, value, argument);
          index += 1;
          break;
        }
        case "--max-chars":
        case "--char-budget":
        case "--budget": maxChars = addOnce(maxChars, positiveInteger(requiredValue(argv, index, argument), argument), argument); index += 1; break;
        case "--compare-draft":
          if (compareDraftSeen) throw new Error("--compare-draft may only be provided once.");
          compareDraftSeen = true;
          compareDraft = true;
          break;
        case "--ref": refs.push(requiredValue(argv, index, argument)); index += 1; break;
        case "--refs": {
          let count = 0;
          while (index + 1 < argv.length && !argv[index + 1]!.startsWith("--")) {
            refs.push(argv[index + 1]!);
            index += 1;
            count += 1;
          }
          if (count === 0) throw new Error("--refs requires at least one reference ID.");
          break;
        }
        default: throw new Error(`Unknown or incomplete argument '${argument}'.`);
      }
    }
  } catch (error) {
    return { options: null, error: error instanceof Error ? error.message : String(error), help: false };
  }

  if (packagePath && storePath) return { options: null, error: "Use --package or --store, not both.", help: false };
  if (!packagePath && !storePath) return { options: null, error: "Provide --package or --store.", help: false };
  if (command === "context" && (!snapshotId || !phaseId || !activity)) {
    return { options: null, error: "context requires --snapshot, --phase, and --activity.", help: false };
  }
  if (command === "expand" && (!snapshotId || refs.length === 0)) {
    return { options: null, error: "expand requires --snapshot and at least one --refs ID.", help: false };
  }
  if (command !== "expand" && refs.length > 0) return { options: null, error: "--refs is only valid for expand.", help: false };
  if (command !== "context" && phaseId) return { options: null, error: "--phase is only valid for context.", help: false };
  if (command !== "context" && activity) return { options: null, error: "--activity is only valid for context.", help: false };
  if (command === "current" && maxChars !== undefined) return { options: null, error: "--max-chars is not valid for current.", help: false };
  if (command === "current" && !snapshotId && compareDraft === false) {
    // The latest real acceptance is the documented display default.
  }

  return {
    options: {
      command,
      ...(packagePath ? { packagePath } : {}),
      ...(storePath ? { storePath } : {}),
      ...(repositoryPath ? { repositoryPath } : {}),
      ...(snapshotId ? { snapshotId } : {}),
      ...(phaseId ? { phaseId } : {}),
      ...(activity ? { activity } : {}),
      refs,
      ...(maxChars === undefined ? {} : { maxChars }),
      compareDraft,
      format,
    },
    error: null,
    help: false,
  };
}

function outputFormat(options: PlanCliOptions): PlanCliResponseFormat {
  return options.format ?? "json";
}

function publicDiagnostic(diagnostic: Diagnostic): PlanCliDiagnostic {
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    path: diagnostic.path,
    ...(diagnostic.itemId ? { item_id: diagnostic.itemId } : {}),
  };
}

function publicDiagnostics(diagnostics: readonly Diagnostic[]): PlanCliDiagnostic[] {
  return diagnostics.map(publicDiagnostic);
}

function requestFor(options: PlanCliOptions): PlanCliResponse["request"] {
  return {
    format: outputFormat(options),
    package_path: options.packagePath ?? null,
    store_path: options.storePath ?? null,
    repository_path: options.repositoryPath ?? null,
    snapshot_id: options.snapshotId ?? null,
    phase_id: options.phaseId ?? null,
    activity: options.activity ?? null,
    refs: [...options.refs],
    max_chars: options.maxChars ?? null,
    compare_draft: options.compareDraft,
  };
}

function responseSource(input: {
  snapshot?: StoredSnapshot | null;
  acceptance?: PlanCliAcceptanceStatus;
  selectedIds?: readonly string[];
  records?: readonly ResultRecord[];
}): PlanCliResponse["source"] {
  const records = input.records ?? [];
  return {
    package_id: input.snapshot?.packageId ?? null,
    snapshot_id: input.snapshot?.snapshotId ?? null,
    revision: input.snapshot?.revision ?? null,
    acceptance_status: input.acceptance ?? "unavailable",
    selected_source_ids: [...new Set(input.selectedIds ?? [])],
    result_ids: [...new Set(records.map((record) => record.result_id))],
    code_revisions: [...new Set(records.map((record) => record.code_revision))],
  };
}

function publicResult(record: ResultRecord, status: "current" | "superseded"): Record<string, unknown> {
  return {
    result_id: record.result_id,
    phase_id: record.phase_id,
    activity: record.activity,
    recorded_at: record.recorded_at,
    code_revision: record.code_revision,
    evidence_status: resultEvidenceStatus(record),
    illustrative: record.illustrative,
    produced_interfaces: record.produced_interfaces.map((item) => ({
      id: item.id,
      name: item.name,
      description_md: item.description_md,
      disposition: item.disposition,
      related_item_ids: [...item.related_item_ids],
    })),
    unresolved_findings: record.unresolved_findings.map((item) => ({
      id: item.id,
      severity: item.severity,
      disposition: item.disposition,
      text_md: item.text_md,
      related_item_ids: [...item.related_item_ids],
    })),
    delivery: { ...record.delivery_facts },
    status,
  };
}

function responseFor(
  options: PlanCliOptions,
  input: Omit<PlanCliResponse, "format" | "format_version" | "request">,
): PlanCliResponse {
  return {
    format: PLAN_CLI_RESPONSE_FORMAT,
    format_version: PLAN_CLI_RESPONSE_VERSION,
    request: requestFor(options),
    ...input,
  };
}

function unavailableResponse(
  options: PlanCliOptions,
  operation: PlanCliResponseOperation | null,
  diagnostics: readonly Diagnostic[],
  message: string,
  exitCode: 0 | 1 | 2 = 1,
): PlanCliRunResult {
  const blocker = errorDiagnostic("plan-cli-unavailable", message, "plan");
  const response = responseFor(options, {
    operation,
    source: responseSource({}),
    outcome: "error",
    diagnostics: publicDiagnostics([...diagnostics, blocker]),
    coverage: "unavailable",
    completeness: "unavailable",
    readiness: { state: "blocked", blockers: publicDiagnostics([blocker]) },
    data: { kind: "failure", message },
  });
  return finishResponse(options, response, renderFailureMarkdown(operation, message, [...diagnostics, blocker]), exitCode);
}

function responseReadiness(state: PlanCliReadinessState, blockers: readonly Diagnostic[] = []): PlanCliResponse["readiness"] {
  return { state, blockers: publicDiagnostics(blockers) };
}

function draftSection(draft: DraftComparison | null): Record<string, unknown> {
  if (!draft) return { state: "not_requested" };
  return {
    state: draft.status === "unavailable" ? "unavailable" : "resolved",
    ...(draft.status === "unavailable" ? { diagnostics: publicDiagnostics(draft.diagnostics) } : {
      items: [{
        status: draft.status,
        revision: draft.revision,
        content_id: draft.contentId,
        diagnostics: publicDiagnostics(draft.diagnostics),
        ...(draft.comparison ? {
          material_change_count: draft.comparison.material_change_count,
          metadata_change_count: draft.comparison.metadata_change_count,
          changes: draft.comparison.changes.map((change) => ({
            id: change.id,
            kind: change.kind,
            classification: change.classification,
            fields: [...change.fields],
          })),
        } : {}),
      }],
    }),
  };
}

function currentResponse(
  options: PlanCliOptions,
  history: PackageHistory,
  snapshot: StoredSnapshot | null,
  draft: DraftComparison | null,
): PlanCliResponse {
  const acceptance = snapshot ? snapshotStatus(snapshot.snapshotId, history.acceptances) : "unverified";
  const hasRetainedMaterial = history.snapshots.length > 0;
  const blocker = !snapshot
    ? errorDiagnostic("snapshot-acceptance-unverified", "No real accepted snapshot is available for executable context.", "snapshot_id")
    : acceptance === "accepted"
      ? null
      : errorDiagnostic("snapshot-acceptance-unverified", `Selected snapshot '${snapshot.snapshotId}' is ${acceptance}.`, "snapshot_id", snapshot.snapshotId);
  const records = snapshot ? historicalResultRecords(history.resultHistory, snapshot.snapshotId) : history.resultHistory.records;
  const current = snapshot ? currentResultRecords(history.resultHistory, snapshot.snapshotId) : [];
  return responseFor(options, {
    operation: "current",
    source: {
      ...responseSource({
        snapshot,
        acceptance: snapshot ? acceptance : hasRetainedMaterial ? "unverified" : "unavailable",
        selectedIds: snapshot ? [snapshot.plan.id, ...snapshot.plan.phases.map((phase) => phase.id)] : [],
        records,
      }),
      package_id: snapshot?.packageId ?? history.packageId,
    },
    outcome: hasRetainedMaterial || snapshot ? "ok" : "error",
    diagnostics: publicDiagnostics(history.diagnostics),
    coverage: hasRetainedMaterial || snapshot ? "complete" : "unavailable",
    completeness: hasRetainedMaterial || snapshot ? "complete" : "unavailable",
    readiness: responseReadiness(snapshot && acceptance === "accepted" ? "not_evaluated" : "blocked", blocker ? [blocker] : []),
    data: {
      kind: "current",
      accepted_baseline: snapshot
        ? { state: "resolved", items: [{ package_id: snapshot.packageId, snapshot_id: snapshot.snapshotId, revision: snapshot.revision, acceptance_status: acceptance }] }
        : { state: "unavailable", diagnostics: publicDiagnostics(blocker ? [blocker] : history.diagnostics) },
      phase_states: snapshot
        ? { state: "resolved", items: snapshot.plan.phases.map((phase, order) => ({ id: phase.id, title: phase.title, depends_on: [...phase.depends_on], order })) }
        : { state: "not_requested" },
      snapshots: {
        state: "resolved",
        items: history.snapshots.map((candidate) => ({
          snapshot_id: candidate.snapshotId,
          package_id: candidate.packageId,
          revision: candidate.revision,
          acceptance_status: snapshotStatus(candidate.snapshotId, history.acceptances),
        })),
      },
      results: { state: "resolved", items: records.map((record) => publicResult(record, current.some((item) => item.result_id === record.result_id) ? "current" : "superseded")) },
      draft_comparison: draftSection(draft),
    },
  });
}

function contextResponse(
  options: PlanCliOptions,
  context: SnapshotContext,
  selection: ContextSelection,
  acceptance: "accepted" | "illustrative" | "unverified",
  draft: DraftComparison | null,
  diagnostics: readonly Diagnostic[],
): PlanCliResponse {
  const historical = historicalResultRecords(context.resultHistory, selection.snapshot_id);
  const current = currentResultRecords(context.resultHistory, selection.snapshot_id);
  const resultByPhase = new Map<string, ResultRecord[]>();
  for (const record of current) {
    const records = resultByPhase.get(record.phase_id) ?? [];
    records.push(record);
    resultByPhase.set(record.phase_id, records);
  }
  return responseFor(options, {
    operation: "context",
    source: responseSource({ snapshot: context.snapshot, acceptance, selectedIds: selection.selected_item_ids, records: historical }),
    outcome: "ok",
    diagnostics: publicDiagnostics(diagnostics),
    coverage: selection.coverage,
    completeness: "complete",
    readiness: responseReadiness(selection.readiness.ready ? "ready" : "blocked", selection.readiness.blockers),
    data: {
      kind: "context",
      plan: {
        id: selection.plan.id,
        title: selection.plan.title,
        revision: selection.plan.revision,
        goal_md: selection.goal_md,
        scope: { included: [...selection.scope.included], excluded: [...selection.scope.excluded] },
      },
      phase: {
        id: selection.phase.id,
        title: selection.phase.title,
        depends_on: [...selection.phase.depends_on],
        objective_md: selection.phase.objective_md,
        approach_md: selection.phase.approach_md,
        tasks: selection.tasks.map((task) => ({ id: task.id, activity: task.activity, text_md: task.text_md })),
      },
      phase_map: { state: "resolved", items: selection.phase_map.map((phase) => ({ ...phase, depends_on: [...phase.depends_on] })) },
      constraints: { state: "resolved", items: selection.constraints.map((item) => ({ id: item.id, text_md: item.text_md })) },
      criteria: { state: "resolved", items: selection.criteria.map((item) => ({ id: item.id, owner_phase_id: item.owner_phase_id, text_md: item.text_md })) },
      decisions: { state: "resolved", items: selection.decisions.map((item) => ({ ...item, applies_to: [...item.applies_to] })) },
      questions: { state: "resolved", items: selection.questions.map((item) => ({ ...item, applies_to: [...item.applies_to] })) },
      references: { state: "resolved", items: selection.references.map((item) => ({ ...item, applies_to: [...item.applies_to] })) },
      assets: { state: "resolved", items: selection.assets.map((item) => ({ ...item, applies_to: [...item.applies_to], dependency_file_ids: [...item.dependency_file_ids], immutable_route: immutableRoute(selection.snapshot_id, item.format === "html" ? "prototype" : "asset", item.id) })) },
      governing: { state: "resolved", items: selection.governing.map((item) => ({ ...item })) },
      expansions: { state: "resolved", items: selection.expandable.map((item) => ({ ...item })) },
      prerequisite_results: {
        state: "resolved",
        items: selection.prerequisite_results.map((item) => ({
          phase_id: item.phase_id,
          status: item.status,
          result_id: item.result_id ?? null,
          interface_ids: [...(item.interface_ids ?? [])],
          unresolved_finding_ids: [...(item.unresolved_finding_ids ?? [])],
          records: (resultByPhase.get(item.phase_id) ?? []).map((record) => publicResult(record, "current")),
        })),
      },
      results: {
        state: "resolved",
        items: historical.map((record) => publicResult(record, current.some((item) => item.result_id === record.result_id) ? "current" : "superseded")),
      },
      limitations: { state: "resolved", items: publicDiagnostics(selection.limitations) },
      draft_comparison: draftSection(draft),
    },
  });
}

function expandResponse(
  options: PlanCliOptions,
  context: SnapshotContext,
  acceptance: "accepted" | "illustrative" | "unverified",
  resolution: ExpansionResolution,
): PlanCliResponse {
  const hasErrors = errorsIn(resolution.diagnostics) || resolution.unavailable;
  return responseFor(options, {
    operation: "expand",
    source: responseSource({
      snapshot: context.snapshot,
      acceptance,
      selectedIds: resolution.items.map((item) => item.request.id),
      records: historicalResultRecords(context.resultHistory, context.snapshot.snapshotId),
    }),
    outcome: hasErrors ? "error" : "ok",
    diagnostics: publicDiagnostics(resolution.diagnostics),
    coverage: hasErrors ? "unavailable" : "complete",
    completeness: "complete",
    readiness: responseReadiness("not_evaluated"),
    data: {
      kind: "expand",
      expansions: {
        state: hasErrors && resolution.items.length === 0 ? "unavailable" : "resolved",
        ...(hasErrors && resolution.items.length === 0
          ? { diagnostics: publicDiagnostics(resolution.diagnostics) }
          : {
            items: resolution.items.map(({ request, rendered }) => ({
              id: request.id,
              request: request.raw,
              state: rendered.unavailable ? "unavailable" : "resolved",
              content_markdown: rendered.text,
            })),
          }),
      },
    },
  });
}

function budgetResponse(response: PlanCliResponse, fullCharacters: number): PlanCliResponse {
  const diagnostic: PlanCliDiagnostic = {
    code: "budget-exceeded",
    severity: "error",
    message: `The complete ${response.request.format} response contains ${fullCharacters} Unicode code points, above the requested limit of ${response.request.max_chars}.`,
    path: "max_chars",
  };
  return {
    ...response,
    outcome: "error",
    diagnostics: [...response.diagnostics, diagnostic],
    completeness: "incomplete",
    readiness: { state: "not_evaluated", blockers: [...response.readiness.blockers, diagnostic] },
    data: {
      kind: "budget",
      full_serialized_characters: fullCharacters,
      requested_max_chars: response.request.max_chars,
      next_steps: ["Raise --max-chars for the complete response.", "Use plan expand with the same explicit snapshot for supporting material."],
    },
  };
}

function budgetMarkdown(response: PlanCliResponse): string {
  const source = response.source;
  const fullCharacters = response.data["full_serialized_characters"];
  return [
    `# Plan ${response.operation ?? "command"} response`,
    "",
    "## Handoff status",
    "- status: INCOMPLETE — character budget exceeded; this output is not executable context.",
    `- characters in complete output: ${typeof fullCharacters === "number" ? fullCharacters : "unknown"}`,
    `- character budget: ${response.request.max_chars ?? "unknown"}`,
    "- exact token count: not reported; no tokenizer was used.",
    "",
    "## Provenance",
    `- package_id: ${source.package_id ? code(source.package_id) : "unknown"}`,
    `- snapshot_id: ${source.snapshot_id ? code(source.snapshot_id) : "unknown"}`,
    `- acceptance: ${source.acceptance_status}`,
    "",
    "## Required omitted IDs",
    `- ${listOrNone(source.selected_source_ids)}`,
    "",
    "## Available explicit expansions",
    "- Re-run with a larger --max-chars or use plan expand against the same snapshot.",
    "",
    "## Diagnostics",
    ...response.diagnostics.map((diagnostic) => `- ${diagnostic.severity.toUpperCase()} \`${diagnostic.code}\` at \`${diagnostic.path}\`: ${diagnostic.message}`),
    "",
  ].join("\n");
}

function renderFailureMarkdown(operation: PlanCliResponseOperation | null, message: string, diagnostics: readonly Diagnostic[]): string {
  return [
    `# Plan ${operation ?? "command"} response`,
    "",
    "## Handoff status",
    `- status: UNAVAILABLE — ${message}`,
    ...diagnosticLines(diagnostics),
    "",
  ].join("\n");
}

function finishResponse(
  options: PlanCliOptions,
  response: PlanCliResponse,
  markdown: string,
  exitCode: 0 | 1 | 2,
): PlanCliRunResult {
  const validation = validatePlanCliResponse(response);
  if (!validation.valid) throw new Error(`Internal plan CLI response violates its public contract: ${validation.errors.join("; ")}`);
  const fullOutput = outputFormat(options) === "json" ? serializePlanCliResponse(response) : markdown;
  if (options.maxChars !== undefined && Array.from(fullOutput).length > options.maxChars) {
    const overflow = budgetResponse(response, Array.from(fullOutput).length);
    const overflowValidation = validatePlanCliResponse(overflow);
    if (!overflowValidation.valid) throw new Error(`Budget response violates its public contract: ${overflowValidation.errors.join("; ")}`);
    return {
      output: outputFormat(options) === "json" ? serializePlanCliResponse(overflow) : budgetMarkdown(overflow),
      exitCode: 1,
      response: overflow,
    };
  }
  return { output: fullOutput, exitCode, response };
}

function diagnosticLines(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => `- ${diagnostic.severity.toUpperCase()} \`${diagnostic.code}\` at \`${diagnostic.path}\`: ${diagnostic.message}${diagnostic.itemId ? ` (item \`${diagnostic.itemId}\`)` : ""}`);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function code(value: string): string {
  return `\`${value}\``;
}

function fenceFor(value: string): string {
  const longest = Math.max(0, ...[...value.matchAll(/`+/g)].map((match) => match[0]?.length ?? 0));
  return "`".repeat(Math.max(3, longest + 1));
}

function markdownText(label: string, value: string): string[] {
  const fence = fenceFor(value);
  return [`### ${label}`, `${fence}md`, value, fence];
}

function listOrNone(values: readonly string[]): string {
  return values.length > 0 ? values.map(code).join(", ") : "(none)";
}

function snapshotStatus(snapshotId: string, acceptances: readonly AcceptanceRecord[]): "accepted" | "illustrative" | "unverified" {
  if (acceptances.some((record) => record.snapshot_id === snapshotId && !record.illustrative)) return "accepted";
  if (acceptances.some((record) => record.snapshot_id === snapshotId && record.illustrative)) return "illustrative";
  return "unverified";
}

function errorsIn(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

function snapshotFileIds(snapshot: StoredSnapshot): string[] {
  return [...snapshot.files.keys()].sort();
}

function immutableRoute(snapshotId: string, kind: "file" | "asset" | "prototype", id: string): string {
  const encodedSnapshot = encodeURIComponent(snapshotId);
  const encodedId = encodeURIComponent(id);
  if (kind === "file") return `/api/snapshots/${encodedSnapshot}/files/${encodedId}`;
  if (kind === "prototype") return `/api/snapshots/${encodedSnapshot}/prototypes/${encodedId}/`;
  return `/api/snapshots/${encodedSnapshot}/assets/${encodedId}`;
}

function isTextualFile(file: PackageFile): boolean {
  const mediaType = file.media_type?.toLowerCase() ?? "";
  if (mediaType.startsWith("text/") || mediaType.includes("json") || mediaType.includes("javascript") || mediaType.includes("xml")) return true;
  return /\.(css|html|js|json|md|markdown|svg|txt|text)$/i.test(file.path);
}

function decodeText(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function renderProvenance(input: {
  packageId: string;
  snapshotId: string;
  revision: number;
  phaseId?: string;
  activity?: ContextActivity;
  acceptance: string;
  selectedItemIds?: readonly string[];
  governingFileIds?: readonly string[];
  coverage?: string;
}): string[] {
  return [
    "## Provenance",
    `- package_id: ${code(input.packageId)}`,
    `- snapshot_id: ${code(input.snapshotId)}`,
    `- revision: ${input.revision}`,
    `- source_identity: ${code(`${input.packageId}@${input.snapshotId}`)}`,
    `- acceptance: ${input.acceptance}`,
    ...(input.phaseId ? [`- phase_id: ${code(input.phaseId)}`] : []),
    ...(input.activity ? [`- activity: ${input.activity}`] : []),
    ...(input.coverage ? [`- coverage: ${input.coverage}`] : []),
    ...(input.selectedItemIds ? [`- selected_item_ids: ${listOrNone(input.selectedItemIds)}`] : []),
    ...(input.governingFileIds ? [`- governing_file_ids: ${listOrNone(input.governingFileIds)}`] : []),
  ];
}

function renderDiagnostics(title: string, diagnostics: readonly Diagnostic[]): string[] {
  if (diagnostics.length === 0) return [];
  return ["", `## ${title}`, ...diagnosticLines(diagnostics)];
}

function renderBlockers(blockers: readonly ContextReadinessBlocker[]): string[] {
  if (blockers.length === 0) return ["- readiness blockers: (none)"];
  return ["- readiness blockers:", ...blockers.map((blocker) => `  - ${blocker.kind}: \`${blocker.code}\` — ${blocker.message}`)];
}

async function readDraftInfo(packagePath: string | undefined): Promise<DraftInfo> {
  if (!packagePath) return { packageId: null, revision: null, contentId: null, diagnostics: [] };
  const manifestPath = join(packagePath, "plan.json");
  try {
    const value = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    const packageIdValue = typeof value["id"] === "string" ? value["id"] : null;
    const packageId = packageIdValue && isValidIdentifier(packageIdValue) ? packageIdValue : null;
    const revision = typeof value["revision"] === "number" && Number.isInteger(value["revision"]) ? value["revision"] : null;
    return { packageId, revision, contentId: null, diagnostics: packageId ? [] : [warningDiagnostic("draft-package-id-unavailable", "The working manifest has no readable package ID.", "plan.json.id")] };
  } catch {
    return { packageId: null, revision: null, contentId: null, diagnostics: [warningDiagnostic("draft-manifest-unavailable", `Working manifest '${manifestPath}' is unavailable; retained snapshots remain the only source.`, "plan.json")] };
  }
}

function storeRoot(options: PlanCliOptions): { root: string; packageRoot?: string; repositoryRoot?: string } {
  const packageRoot = options.packagePath ? resolve(process.cwd(), options.packagePath) : undefined;
  const repositoryRoot = options.repositoryPath ? resolve(process.cwd(), options.repositoryPath) : undefined;
  return {
    root: resolve(options.storePath ?? join(packageRoot ?? process.cwd(), ".plan-package")),
    ...(packageRoot ? { packageRoot } : {}),
    ...(repositoryRoot ? { repositoryRoot } : {}),
  };
}

async function loadHistory(options: PlanCliOptions): Promise<PackageHistory> {
  const roots = storeRoot(options);
  const store = new SnapshotStore({ root: roots.root });
  const packageHint = await readDraftInfo(roots.packageRoot);
  const snapshotHistory = await store.listSnapshots(packageHint.packageId ?? undefined);
  const acceptanceHistory = await store.listAcceptances(packageHint.packageId ?? undefined);
  const packageIds = [...new Set([
    ...snapshotHistory.snapshots.map((snapshot) => snapshot.packageId),
    ...acceptanceHistory.records.map((record) => record.package_id),
  ])];
  const packageId = packageHint.packageId ?? (packageIds.length === 1 ? packageIds[0]! : null);
  const diagnostics = [...packageHint.diagnostics, ...snapshotHistory.diagnostics, ...acceptanceHistory.diagnostics];
  if (!packageId && packageIds.length > 1) {
    diagnostics.push(errorDiagnostic("package-selection-ambiguous", "The selected store contains more than one package; provide --package with a readable manifest.", ".plan-package"));
  }
  const snapshots = packageId
    ? snapshotHistory.snapshots.filter((snapshot) => snapshot.packageId === packageId)
    : snapshotHistory.snapshots;
  const acceptances = packageId
    ? acceptanceHistory.records.filter((record) => record.package_id === packageId)
    : acceptanceHistory.records;
  const resultHistory = await store.listResults(packageId ?? undefined);
  return {
    store,
    packageId,
    packageHint,
    snapshots,
    acceptances,
    resultHistory,
    diagnostics: [...diagnostics, ...resultHistory.diagnostics],
  };
}

async function loadSnapshotContext(options: PlanCliOptions, snapshotId: string): Promise<SnapshotContextLoadResult> {
  const roots = storeRoot(options);
  const store = new SnapshotStore({ root: roots.root });
  const packageHint = await readDraftInfo(roots.packageRoot);
  const opened = await store.open(snapshotId);
  if (!opened.snapshot) return { context: null, diagnostics: [...packageHint.diagnostics, ...opened.diagnostics] };
  const acceptances = await store.listAcceptances(opened.snapshot.packageId);
  const resultHistory = await store.listResults(opened.snapshot.packageId);
  const diagnostics = [
    ...packageHint.diagnostics,
    ...opened.diagnostics,
    ...acceptances.diagnostics,
    ...resultHistory.diagnostics,
  ];
  if (packageHint.packageId && packageHint.packageId !== opened.snapshot.packageId) {
    diagnostics.push(errorDiagnostic("snapshot-package-mismatch", `Snapshot package '${opened.snapshot.packageId}' does not match selected package '${packageHint.packageId}'.`, "snapshot.package_id"));
  }
  return {
    context: { store, snapshot: opened.snapshot, packageHint, acceptances: acceptances.records, resultHistory, diagnostics },
    diagnostics,
  };
}

function acceptanceFor(snapshotId: string, acceptances: readonly AcceptanceRecord[]): AcceptanceRecord | null {
  return acceptances.filter((record) => record.snapshot_id === snapshotId).at(-1) ?? null;
}

function currentResultRecords(history: ResultHistoryResult, snapshotId: string, phaseId?: string, activity?: ContextActivity): ResultRecord[] {
  return history.current
    .filter((record) => record.snapshot_id === snapshotId && (!phaseId || record.phase_id === phaseId) && (!activity || record.activity === activity))
    .sort((left, right) => left.recorded_at.localeCompare(right.recorded_at) || left.result_id.localeCompare(right.result_id));
}

function historicalResultRecords(history: ResultHistoryResult, snapshotId: string, phaseId?: string): ResultRecord[] {
  return history.records
    .filter((record) => record.snapshot_id === snapshotId && (!phaseId || record.phase_id === phaseId))
    .sort((left, right) => left.recorded_at.localeCompare(right.recorded_at) || left.result_id.localeCompare(right.result_id));
}

function prerequisiteResults(plan: PlanPackage, phaseId: string, snapshotId: string, history: ResultHistoryResult): ContextPrerequisiteResult[] {
  const phase = plan.phases.find((candidate) => candidate.id === phaseId);
  return [...new Set(phase?.depends_on ?? [])]
    .map((phaseId) => {
      const records = currentResultRecords(history, snapshotId, phaseId);
      const record = records.at(-1);
      if (!record) return { phase_id: phaseId, status: "missing" } satisfies ContextPrerequisiteResult;
      const unresolved = records.some((candidate) => candidate.unresolved_findings.length > 0);
      return {
        phase_id: phaseId,
        status: unresolved ? "unresolved" : "available",
        result_id: record.result_id,
        interface_ids: [...new Set(records.flatMap((candidate) => candidate.produced_interfaces.map((item) => item.id)))],
        unresolved_finding_ids: [...new Set(records.flatMap((candidate) => candidate.unresolved_findings.map((item) => item.id)))],
      } satisfies ContextPrerequisiteResult;
    });
}

async function compareDraft(options: PlanCliOptions, snapshot: StoredSnapshot): Promise<DraftComparison> {
  if (!options.compareDraft) return { status: "same", revision: null, contentId: null, diagnostics: [] };
  const roots = storeRoot(options);
  if (!roots.packageRoot) {
    return {
      status: "unavailable",
      revision: null,
      contentId: null,
      diagnostics: [warningDiagnostic("draft-comparison-unavailable", "--compare-draft requires --package; the selected store has no working package root.", "package")],
    };
  }
  let loaded: CandidateLoadResult;
  try {
    loaded = await loadCandidate({ packageRoot: roots.packageRoot, repositoryRoot: roots.repositoryRoot ?? process.cwd() });
  } catch (error) {
    return {
      status: "unavailable",
      revision: null,
      contentId: null,
      diagnostics: [warningDiagnostic("draft-comparison-unavailable", error instanceof Error ? error.message : "The working draft could not be inspected.", "plan.json")],
    };
  }
  if (!loaded.candidate) {
    return {
      status: "unavailable",
      revision: null,
      contentId: null,
      diagnostics: [warningDiagnostic("draft-comparison-unavailable", "The working draft could not be resolved; no draft material was blended into the accepted snapshot.", "plan.json"), ...loaded.diagnostics],
    };
  }
  if (loaded.candidate.packageId !== snapshot.packageId) {
    return {
      status: "unavailable",
      revision: loaded.candidate.revision,
      contentId: loaded.candidate.contentId,
      diagnostics: [errorDiagnostic("draft-package-mismatch", `Working draft package '${loaded.candidate.packageId}' does not match snapshot package '${snapshot.packageId}'.`, "plan.json.id")],
    };
  }
  const sameManifest = loaded.candidate.manifestBytes.byteLength === snapshot.manifestBytes.byteLength
    && loaded.candidate.manifestBytes.every((byte, index) => byte === snapshot.manifestBytes[index]);
  const sameContent = sameManifest && loaded.candidate.contentId === snapshot.contentId;
  const draftFiles = loaded.candidate.snapshotFiles.map((file) => ({ ...file, ...(file.omission ? { omission: { ...file.omission } } : {}) }));
  const draftOmissions = loaded.candidate.snapshotOmissions.map((omission) => ({ ...omission }));
  const draftDescriptor: SnapshotDescriptor = {
    format: "plan-package-snapshot",
    format_version: "1",
    snapshot_id: sha256(snapshotIdentityInput(loaded.candidate.manifestBytes, draftFiles, draftOmissions)),
    package_id: loaded.candidate.packageId,
    author_revision: loaded.candidate.revision,
    manifest_sha256: sha256(loaded.candidate.manifestBytes),
    content_id: loaded.candidate.contentId,
    files: draftFiles,
    omissions: draftOmissions,
  };
  const comparison = compareSnapshots(
    {
      snapshot_id: snapshot.snapshotId,
      package_id: snapshot.packageId,
      plan: snapshot.plan,
      descriptor: snapshot.descriptor,
      files: new Map([...snapshot.files.entries()].map(([fileId, file]) => [fileId, new Uint8Array(file.bytes)])),
    },
    {
      snapshot_id: draftDescriptor.snapshot_id,
      package_id: loaded.candidate.packageId,
      plan: loaded.candidate.plan,
      descriptor: draftDescriptor,
      files: new Map([...loaded.candidate.files.entries()].map(([fileId, file]) => [fileId, new Uint8Array(file.bytes)])),
    },
  );
  if (!comparison.valid || !comparison.value) {
    return {
      status: "unavailable",
      revision: loaded.candidate.revision,
      contentId: loaded.candidate.contentId,
      diagnostics: [...loaded.diagnostics, ...comparison.diagnostics],
    };
  }
  if (sameContent) return { status: "same", revision: loaded.candidate.revision, contentId: loaded.candidate.contentId, diagnostics: loaded.diagnostics, comparison: comparison.value };
  return {
    status: loaded.candidate.revision > snapshot.revision ? "newer" : "changed",
    revision: loaded.candidate.revision,
    contentId: loaded.candidate.contentId,
    diagnostics: loaded.diagnostics,
    comparison: comparison.value,
  };
}

function renderDraftComparison(comparison: DraftComparison, snapshotId: string): string[] {
  if (comparison.status === "same") return ["", "## Draft comparison", "- working draft: same retained content as the selected snapshot; no newer material was consulted."];
  if (comparison.status === "unavailable") return ["", "## Draft comparison", "- working draft: unavailable; the accepted snapshot remains pinned and no draft bytes were used."];
  return [
    "",
    "## Draft comparison",
    `- working draft: ${comparison.status === "newer" ? "NEWER" : "CHANGED"} material is available, but it is not part of this handoff.`,
    `- draft revision: ${comparison.revision ?? "unknown"}`,
    `- draft content ID: ${comparison.contentId ? code(comparison.contentId) : "unknown"}`,
    `- accepted baseline remains snapshot ${code(snapshotId)}; request a new accepted snapshot before using draft changes.`,
    ...(comparison.comparison ? [
      `- W02 comparison: ${comparison.comparison.material_change_count} material change(s), ${comparison.comparison.metadata_change_count} metadata change(s).`,
      ...(comparison.comparison.changes.length > 0 ? ["- changed item IDs:", ...comparison.comparison.changes.map((change) => `  - ${code(change.id)} — ${change.classification} ${change.kind}; ${change.fields.join(", ")}`)] : ["- changed item IDs: (none)"]),
    ] : []),
  ];
}

function renderStatements(title: string, statements: readonly ResultStatement[]): string[] {
  if (statements.length === 0) return [];
  return [
    `#### ${title}`,
    ...statements.flatMap((statement) => [
      `- ${code(statement.id)} [${statement.disposition}] — ${statement.text_md}`,
      `  - related item IDs: ${listOrNone(statement.related_item_ids)}`,
    ]),
  ];
}

function renderInterfaces(interfaces: readonly ResultInterface[]): string[] {
  if (interfaces.length === 0) return [];
  return [
    "#### Produced interfaces",
    ...interfaces.flatMap((item) => [
      `- ${code(item.id)} ${item.name} [${item.disposition}] — ${item.description_md}`,
      `  - related item IDs: ${listOrNone(item.related_item_ids)}`,
    ]),
  ];
}

function renderFindings(findings: readonly ResultFinding[]): string[] {
  if (findings.length === 0) return [];
  return [
    "#### Unresolved findings",
    ...findings.flatMap((finding) => [
      `- ${code(finding.id)} [${finding.severity}; ${finding.disposition}] — ${finding.text_md}`,
      `  - related item IDs: ${listOrNone(finding.related_item_ids)}`,
    ]),
  ];
}

function renderEvidence(evidence: readonly ResultEvidence[]): string[] {
  if (evidence.length === 0) return ["#### Evidence", "- no evidence links recorded; this absence is not a success claim."];
  return [
    "#### Evidence",
    ...evidence.flatMap((item) => [
      `- ${code(item.id)} [${item.status}; ${item.kind}] — ${item.label}`,
      `  - locator: ${code(item.locator)}`,
      `  - code revision: ${code(item.code_revision)}`,
      `  - supports: ${listOrNone(item.statement_ids)}`,
    ]),
  ];
}

function renderResultRecord(record: ResultRecord, status: "current" | "superseded"): string[] {
  return [
    `### ${record.result_id} — ${record.activity} — ${status}${record.illustrative ? " — illustrative" : ""}`,
    `- result_id: ${code(record.result_id)}`,
    `- phase_id: ${code(record.phase_id)}`,
    `- activity: ${record.activity}`,
    `- source snapshot: ${code(record.snapshot_id)}`,
    `- recorded at: ${record.recorded_at}`,
    `- code revision: ${code(record.code_revision)}`,
    `- evidence status: ${resultEvidenceStatus(record)}`,
    `- author: ${record.author}`,
    ...renderStatements("Intended work", record.intended_work),
    ...renderStatements("Observed facts", record.observed_facts),
    ...renderStatements("Inferences", record.inferences),
    ...renderStatements("Unverified claims", record.unverified_claims),
    ...renderInterfaces(record.produced_interfaces),
    ...renderStatements("Deviations", record.deviations),
    ...renderFindings(record.unresolved_findings),
    ...renderEvidence(record.evidence),
    ...renderStatements("Continuation notes", record.continuation_notes),
    `- delivery: review ${record.delivery_facts.review_status}; integration ${record.delivery_facts.integration_status}${record.delivery_facts.pr_url ? `; PR ${record.delivery_facts.pr_url}` : ""}`,
  ];
}

function renderContext(selection: ContextSelection, history: ResultHistoryResult, acceptance: string, draft: DraftComparison | null, diagnostics: readonly Diagnostic[]): string {
  const currentResults = currentResultRecords(history, selection.snapshot_id, selection.phase_id, selection.activity);
  const historicalResults = historicalResultRecords(history, selection.snapshot_id, selection.phase_id).filter((record) => record.activity === selection.activity);
  const resultById = new Map(history.records.map((record) => [record.result_id, record]));
  const currentResultsByPhase = new Map<string, ResultRecord[]>();
  for (const record of history.current.filter((candidate) => candidate.snapshot_id === selection.snapshot_id)) {
    const records = currentResultsByPhase.get(record.phase_id) ?? [];
    records.push(record);
    currentResultsByPhase.set(record.phase_id, records);
  }
  const prerequisiteLines = selection.prerequisite_results.flatMap((result) => {
    const record = result.result_id ? resultById.get(result.result_id) : undefined;
    const records = currentResultsByPhase.get(result.phase_id) ?? [];
    return [
      `### ${result.phase_id}`,
      `- status: ${result.status}`,
      `- result ID: ${result.result_id ? code(result.result_id) : "(none)"}`,
      `- interface IDs: ${listOrNone(result.interface_ids ?? [])}`,
      `- unresolved finding IDs: ${listOrNone(result.unresolved_finding_ids ?? [])}`,
      ...(record ? [
        `- record evidence status: ${resultEvidenceStatus(record)}${record.illustrative ? "; illustrative" : ""}`,
        ...records.flatMap((candidate) => [
          `#### ${candidate.result_id} — ${candidate.activity}`,
          ...renderInterfaces(candidate.produced_interfaces),
          ...renderFindings(candidate.unresolved_findings),
        ]),
      ] : []),
    ];
  });
  const lines = [
    `# Plan context — ${selection.plan.title}`,
    "",
    "## Handoff status",
    `- status: ${selection.readiness.ready ? "READY" : "BLOCKED"} — ${selection.readiness.ready ? "selected material is complete for this request." : "this handoff is not executable until the blockers are resolved."}`,
    `- coverage: ${selection.coverage}`,
    ...renderBlockers(selection.readiness.blockers),
    ...renderProvenance({
      packageId: selection.package_id,
      snapshotId: selection.snapshot_id,
      revision: selection.revision,
      phaseId: selection.phase_id,
      activity: selection.activity,
      acceptance,
      selectedItemIds: selection.selected_item_ids,
      governingFileIds: selection.governing_file_ids,
      coverage: selection.coverage,
    }),
    "",
    "## Goal",
    ...markdownText("Accepted goal", selection.goal_md),
    "",
    "## Scope",
    `- included: ${listOrNone(selection.scope.included)}`,
    `- excluded: ${listOrNone(selection.scope.excluded)}`,
    "",
    "## Governing provenance",
    ...selection.governing.map((item) => `- ${code(item.id)} [${item.kind}] — ${item.source.package_id}/${item.source.snapshot_id}; ${item.reason}`),
    "",
    "## Current phase",
    `- ${code(selection.phase.id)} ${selection.phase.title}`,
    `- depends on: ${listOrNone(selection.phase.depends_on)}`,
    ...markdownText("Objective", selection.phase.objective_md),
    ...markdownText("Approach", selection.phase.approach_md),
    "### Tasks",
    ...(selection.tasks.length > 0 ? selection.tasks.map((task) => `- ${code(task.id)} — ${task.text_md}`) : ["- (none declared for this activity)"]),
    "",
    "## Phase map",
    ...selection.phase_map.map((phase) => `- ${code(phase.id)} — ${phase.title}; depends on ${listOrNone(phase.depends_on)}`),
    "",
    "## Shared constraints",
    ...(selection.constraints.length > 0 ? selection.constraints.flatMap((constraint) => markdownText(`${constraint.id}`, constraint.text_md)) : ["- (none)"]),
    "",
    "## Applicable acceptance criteria",
    ...(selection.criteria.length > 0 ? selection.criteria.flatMap((criterion) => [
      `### ${criterion.id} (owner phase ${criterion.owner_phase_id})`,
      ...markdownText("Exact governing wording", criterion.text_md),
    ]) : ["- (none)"]),
    "",
    "## Decisions",
    ...(selection.decisions.length > 0 ? selection.decisions.flatMap((decision) => [
      `### ${decision.id} — ${decision.title}`,
      ...markdownText("Decision", decision.decision_md),
      ...(decision.rationale_md ? markdownText("Rationale", decision.rationale_md) : []),
    ]) : ["- (none)"]),
    "",
    "## Questions",
    ...(selection.questions.length > 0 ? selection.questions.flatMap((question) => [
      `### ${question.id} — ${question.title}`,
      `- status: ${question.status}; blocking: ${question.blocking}`,
      ...markdownText("Question", question.question_md),
    ]) : ["- (none)"]),
    "",
    "## Required references and assets",
    ...(selection.references.length > 0 ? selection.references.flatMap((reference) => [
      `- reference ${code(reference.id)} — ${reference.required ? "required" : "optional"}; source is snapshot-bound`,
      ...markdownText(`Reference purpose — ${reference.id}`, reference.purpose_md),
    ]) : ["- references: (none)"]),
    ...(selection.assets.length > 0 ? selection.assets.flatMap((asset) => [
      `- asset ${code(asset.id)} — ${asset.authority}; ${asset.required ? "required" : "optional"}; source is snapshot-bound`,
      ...markdownText(`Asset purpose — ${asset.id}`, asset.purpose_md),
      `  - immutable route: ${code(immutableRoute(selection.snapshot_id, asset.format === "html" ? "prototype" : "asset", asset.id))}`,
    ]) : ["- assets: (none)"]),
    `- governing file IDs: ${listOrNone(selection.governing_file_ids)}`,
    "",
    "## Prerequisite results",
    ...(prerequisiteLines.length > 0 ? prerequisiteLines : ["- (none declared)"]),
    "",
    "## Current result records",
    ...(currentResults.length > 0 ? currentResults.flatMap((record) => renderResultRecord(record, "current")) : ["- no current retained result for this phase/activity selection"]),
    ...(historicalResults.length > currentResults.length ? ["", "### Historical result IDs", `- ${listOrNone(historicalResults.filter((record) => !currentResults.some((current) => current.result_id === record.result_id)).map((record) => record.result_id))}`] : []),
    "",
    "## Available expansions",
    `- ${listOrNone(selection.expandable.map((item) => item.id))}`,
    "- Use `plan expand --snapshot <same snapshot> --refs <ID...>`; expansion never reads a mutable working path.",
    ...(selection.limitations.length > 0 ? ["", "## Coverage limitations", ...diagnosticLines(selection.limitations)] : []),
    ...(draft ? renderDraftComparison(draft, selection.snapshot_id) : []),
    ...renderDiagnostics("Selection diagnostics", diagnostics),
  ];
  return `${lines.join("\n")}\n`;
}

function renderCurrent(history: PackageHistory, snapshot: StoredSnapshot | null, draft: DraftComparison | null): string {
  const packageId = history.packageId ?? snapshot?.packageId ?? "unknown";
  if (!snapshot) {
    const lines = [
      `# Current plan package — ${packageId}`,
      "",
      "## Handoff status",
      "- status: UNACCEPTED — no real non-illustrative acceptance record is available; no draft was substituted as executable context.",
      `- package: ${code(packageId)}`,
      ...(history.packageHint.revision !== null ? [`- working draft revision: ${history.packageHint.revision} (inspection only)`] : []),
      "- accepted snapshot: (none)",
      "",
      "## Retained snapshots",
      ...(history.snapshots.length > 0 ? history.snapshots.map((candidate) => `- ${code(candidate.snapshotId)} — revision ${candidate.revision}; acceptance ${snapshotStatus(candidate.snapshotId, history.acceptances)}`) : ["- (none available)"]),
      "",
      "Executable context is unavailable until a real acceptance record names a retained snapshot.",
      ...renderDiagnostics("Diagnostics", history.diagnostics),
    ];
    return `${lines.join("\n")}\n`;
  }

  const acceptance = acceptanceFor(snapshot.snapshotId, history.acceptances);
  const status = snapshotStatus(snapshot.snapshotId, history.acceptances);
  const current = currentResultRecords(history.resultHistory, snapshot.snapshotId);
  const historical = historicalResultRecords(history.resultHistory, snapshot.snapshotId);
  const files = snapshot.descriptor.files;
  const lines = [
    `# Current plan package — ${snapshot.plan.title}`,
    "",
    "## Handoff status",
    `- status: ${status === "accepted" ? "ACCEPTED" : status === "illustrative" ? "ILLUSTRATIVE — not executable" : "UNACCEPTED — not executable"}`,
    `- package: ${code(snapshot.packageId)}`,
    `- selected snapshot: ${code(snapshot.snapshotId)}`,
    ...renderProvenance({ packageId: snapshot.packageId, snapshotId: snapshot.snapshotId, revision: snapshot.revision, acceptance: status }),
    "",
    "## Accepted goal",
    ...markdownText("Goal", snapshot.plan.goal_md),
    "",
    "## Snapshot files",
    ...files.map((file) => `- ${code(file.id)} — ${file.available ? "available" : "UNAVAILABLE"}; ${file.path}${file.available ? "" : ` — ${file.omission?.message ?? "retained bytes are unavailable"}`}`),
    `- available file IDs: ${listOrNone(snapshotFileIds(snapshot))}`,
    "",
    "## Current result records",
    ...(current.length > 0 ? current.flatMap((record) => renderResultRecord(record, "current")) : ["- no current retained result records for this snapshot"]),
    "",
    "## Result history",
    ...(historical.length > 0 ? historical.map((record) => `- ${code(record.result_id)} — ${record.phase_id}/${record.activity}; ${current.some((candidate) => candidate.result_id === record.result_id) ? "current" : "superseded"}; code ${code(record.code_revision)}; evidence ${resultEvidenceStatus(record)}`) : ["- (none)"]),
    ...(acceptance ? ["", "## Acceptance provenance", `- record: ${code(acceptance.record_id)}`, `- actor: ${acceptance.actor}`, `- source: ${acceptance.source}`, `- recorded at: ${acceptance.recorded_at}`, `- illustrative: ${acceptance.illustrative}`] : []),
    ...(draft ? renderDraftComparison(draft, snapshot.snapshotId) : []),
    ...(draft && draft.diagnostics.length > 0 ? renderDiagnostics("Draft comparison diagnostics", draft.diagnostics) : []),
    ...renderDiagnostics("Diagnostics", history.diagnostics),
  ];
  return `${lines.join("\n")}\n`;
}

function expansionRequest(raw: string, packageId: string, snapshotId: string): ExpansionRequest {
  const separator = raw.indexOf(":");
  if (separator > 0 && separator < raw.length - 1) {
    const prefix = raw.slice(0, separator);
    const id = raw.slice(separator + 1);
    if (prefix.length === snapshotId.length && /^[a-f0-9]+$/.test(prefix)) return { raw, id, sourceSnapshotId: prefix };
    return { raw, id, sourcePackageId: prefix };
  }
  return { raw, id: raw, sourcePackageId: packageId };
}

function planItem(plan: PlanPackage, id: string): { kind: string; value: unknown; ownerPhaseId?: string } | null {
  if (plan.id === id) return { kind: "plan", value: plan };
  const constraint = plan.constraints.find((item) => item.id === id);
  if (constraint) return { kind: "constraint", value: constraint };
  for (const phase of plan.phases) {
    if (phase.id === id) return { kind: "phase", value: phase };
    const task = phase.tasks?.find((item) => item.id === id);
    if (task) return { kind: "task", value: task, ownerPhaseId: phase.id };
    const criterion = phase.acceptance_criteria.find((item) => item.id === id);
    if (criterion) return { kind: "criterion", value: criterion, ownerPhaseId: phase.id };
  }
  const reference = plan.references.find((item) => item.id === id);
  if (reference) return { kind: "reference", value: reference };
  const asset = plan.assets.find((item) => item.id === id);
  if (asset) return { kind: "asset", value: asset };
  const decision = plan.decisions.find((item) => item.id === id);
  if (decision) return { kind: "decision", value: decision };
  const question = plan.questions.find((item) => item.id === id);
  if (question) return { kind: "question", value: question };
  const file = plan.files.find((item) => item.id === id);
  if (file) return { kind: "file", value: file };
  return null;
}

function renderFileContent(snapshot: StoredSnapshot, file: PackageFile, label: string, routeKind: "file" | "asset" | "prototype" = "file"): ExpansionRenderResult {
  const bytes = snapshot.getFileBytes(file.id);
  const route = immutableRoute(snapshot.snapshotId, routeKind, file.id);
  const lines = [
    `### ${label}`,
    `- file: ${code(file.id)}`,
    `- path: ${code(file.path)}`,
    `- media type: ${file.media_type ?? "unknown"}`,
    `- immutable snapshot route: ${code(route)}`,
  ];
  if (!bytes) {
    lines.push("- availability: UNAVAILABLE in this snapshot; the mutable source path was not consulted.");
    return { text: lines.join("\n"), unavailable: true };
  }
  if (!isTextualFile(file)) {
    lines.push("- content: binary/visual material is available through the immutable route above; it is not decoded as Markdown text.");
    return { text: lines.join("\n"), unavailable: false };
  }
  const text = decodeText(bytes);
  if (text === null) {
    lines.push("- content: available bytes are not valid UTF-8 text; inspect the immutable route above.");
    return { text: lines.join("\n"), unavailable: false };
  }
  return { text: [...lines, ...markdownText("Retained text", text)].join("\n"), unavailable: false };
}

function renderExpansionItem(snapshot: StoredSnapshot, request: ExpansionRequest): ExpansionRenderResult {
  const item = planItem(snapshot.plan, request.id);
  if (!item) return { text: `### ${request.raw}\n- ERROR: item ID is not declared by snapshot ${code(snapshot.snapshotId)}.`, unavailable: true };
  switch (item.kind) {
    case "plan": {
      const plan = item.value as PlanPackage;
      return { text: [
        `### plan ${plan.id}`,
        ...markdownText("Goal", plan.goal_md),
        `- included scope: ${listOrNone(plan.scope.included)}`,
        `- excluded scope: ${listOrNone(plan.scope.excluded)}`,
      ].join("\n"), unavailable: false };
    }
    case "constraint": {
      const constraint = item.value as { id: string; text_md: string };
      return { text: [`### constraint ${constraint.id}`, ...markdownText("Exact wording", constraint.text_md)].join("\n"), unavailable: false };
    }
    case "phase": {
      const phase = item.value as Phase;
      return { text: [
        `### phase ${phase.id} — ${phase.title}`,
        `- depends on: ${listOrNone(phase.depends_on)}`,
        ...markdownText("Objective", phase.objective_md),
        ...markdownText("Approach", phase.approach_md),
        "#### Tasks",
        ...(phase.tasks?.map((task) => `- ${code(task.id)} [${task.activity}] — ${task.text_md}`) ?? ["- (none)"]),
        "#### Acceptance criteria",
        ...(phase.acceptance_criteria.flatMap((criterion) => [
          `- ${code(criterion.id)}`,
          ...markdownText("Exact wording", criterion.text_md),
        ])),
      ].join("\n"), unavailable: false };
    }
    case "task": {
      const task = item.value as PhaseTask;
      return { text: [`### task ${task.id}`, `- owner phase: ${code(item.ownerPhaseId ?? "unknown")}`, `- activity: ${task.activity}`, ...markdownText("Exact wording", task.text_md)].join("\n"), unavailable: false };
    }
    case "criterion": {
      const criterion = item.value as AcceptanceCriterion;
      return { text: [`### criterion ${criterion.id}`, `- owner phase: ${code(item.ownerPhaseId ?? "unknown")}`, ...markdownText("Exact governing wording", criterion.text_md)].join("\n"), unavailable: false };
    }
    case "reference": {
      const reference = item.value as Reference;
      const file = reference.kind === "local"
        ? snapshot.plan.files.find((candidate) => candidate.id === reference.file_id)
        : reference.local_file_id ? snapshot.plan.files.find((candidate) => candidate.id === reference.local_file_id) : undefined;
      const metadata = [
        `### reference ${reference.id}`,
        `- kind: ${reference.kind}`,
        `- required: ${reference.required}`,
        ...markdownText("Purpose", reference.purpose_md),
        ...(reference.kind === "external" ? [`- URL: ${reference.url}`, `- access: ${reference.access}`, "- external bytes are not fetched by the local CLI"] : []),
      ];
      if (!file) return { text: [...metadata, "- availability: UNAVAILABLE; no retained local copy is declared."].join("\n"), unavailable: reference.required };
      const content = renderFileContent(snapshot, file, `Retained reference file ${file.id}`);
      return { text: [...metadata, content.text].join("\n"), unavailable: content.unavailable };
    }
    case "asset": {
      const asset = item.value as PackageAsset;
      const file = snapshot.plan.files.find((candidate) => candidate.id === asset.file_id);
      const metadata = [
        `### asset ${asset.id}`,
        `- format: ${asset.format}`,
        `- authority: ${asset.authority}`,
        `- required: ${asset.required}`,
        `- mock: ${asset.mock}`,
        ...markdownText("Purpose", asset.purpose_md),
        `- immutable asset route: ${code(immutableRoute(snapshot.snapshotId, asset.format === "html" ? "prototype" : "asset", asset.id))}`,
      ];
      if (!file) return { text: [...metadata, "- availability: UNAVAILABLE; the declared asset file is not present in the retained manifest."].join("\n"), unavailable: asset.required };
      const content = renderFileContent(snapshot, file, `Retained asset file ${file.id}`);
      const dependencies = asset.dependency_file_ids.map((fileId) => {
        const dependency = snapshot.plan.files.find((candidate) => candidate.id === fileId);
        return dependency ? `- dependency ${code(fileId)}: ${code(immutableRoute(snapshot.snapshotId, "file", fileId))}` : `- dependency ${code(fileId)}: UNAVAILABLE`;
      });
      return { text: [...metadata, "- dependency routes:", ...(dependencies.length > 0 ? dependencies : ["  - (none)" ]), content.text].join("\n"), unavailable: content.unavailable };
    }
    case "decision": {
      const decision = item.value as Decision;
      return { text: [`### decision ${decision.id} — ${decision.title}`, ...markdownText("Decision", decision.decision_md), ...(decision.rationale_md ? markdownText("Rationale", decision.rationale_md) : [])].join("\n"), unavailable: false };
    }
    case "question": {
      const question = item.value as Question;
      return { text: [`### question ${question.id} — ${question.title}`, `- status: ${question.status}; blocking: ${question.blocking}`, ...markdownText("Question", question.question_md)].join("\n"), unavailable: false };
    }
    case "file": return renderFileContent(snapshot, item.value as PackageFile, `file ${(item.value as PackageFile).id}`);
    default: return { text: `### ${request.raw}\n- ERROR: unsupported expansion kind '${item.kind}'.`, unavailable: true };
  }
}

function resolveExpand(
  snapshot: StoredSnapshot,
  requests: readonly ExpansionRequest[],
  diagnostics: readonly Diagnostic[],
): ExpansionResolution {
  const validRequests: ExpansionRequest[] = [];
  const errors: Diagnostic[] = [...diagnostics];
  for (const request of requests) {
    let requestValid = true;
    if (request.sourceSnapshotId && request.sourceSnapshotId !== snapshot.snapshotId) {
      errors.push(errorDiagnostic("cross-snapshot-expansion", `Expansion '${request.raw}' names snapshot '${request.sourceSnapshotId}', but the selected snapshot is '${snapshot.snapshotId}'.`, "refs", request.id));
      requestValid = false;
    }
    if (request.sourcePackageId && request.sourcePackageId !== snapshot.packageId) {
      errors.push(errorDiagnostic("cross-package-expansion", `Expansion '${request.raw}' names package '${request.sourcePackageId}', but the selected package is '${snapshot.packageId}'.`, "refs", request.id));
      requestValid = false;
    }
    if (!isValidIdentifier(request.id)) {
      errors.push(errorDiagnostic("invalid-expansion-id", `Expansion ID '${request.id}' is not a valid package identifier.`, "refs", request.id));
      requestValid = false;
    }
    if (requestValid) validRequests.push(request);
  }
  const declaredIds = collectAddressableIds(snapshot.plan);
  for (const request of validRequests) if (!declaredIds.has(request.id)) errors.push(errorDiagnostic("unknown-expansion-id", `Expansion ID '${request.id}' is not declared by snapshot '${snapshot.snapshotId}'.`, "refs", request.id));
  const items = validRequests
    .filter((request) => declaredIds.has(request.id))
    .map((request) => ({ request, rendered: renderExpansionItem(snapshot, request) }));
  return { items, diagnostics: errors, unavailable: items.some((item) => item.rendered.unavailable) };
}

function renderExpand(snapshot: StoredSnapshot, resolution: ExpansionResolution, acceptance: string): string {
  const full = [
    `# Expanded plan material — ${snapshot.plan.title}`,
    "",
    "## Handoff status",
    `- status: ${acceptance === "accepted" ? "ACCEPTED SNAPSHOT" : `${acceptance.toUpperCase()} — inspection only; this material is not executable context.`}`,
    "",
    ...renderProvenance({ packageId: snapshot.packageId, snapshotId: snapshot.snapshotId, revision: snapshot.revision, acceptance }),
    "",
    ...resolution.items.flatMap((item) => [item.rendered.text, ""]),
    ...renderDiagnostics("Expansion diagnostics", resolution.diagnostics),
  ].join("\n");
  return `${full.trimEnd()}\n`;
}

async function runCurrent(options: PlanCliOptions): Promise<PlanCliRunResult> {
  const history = await loadHistory(options);
  let snapshot: StoredSnapshot | null = null;
  if (options.snapshotId) {
    const loaded = await loadSnapshotContext(options, options.snapshotId);
    snapshot = loaded.context?.snapshot ?? null;
    if (loaded.context) {
      history.acceptances = loaded.context.acceptances;
      history.resultHistory = loaded.context.resultHistory;
      history.diagnostics = [...history.diagnostics, ...loaded.context.diagnostics];
    } else {
      history.diagnostics.push(...loaded.diagnostics);
    }
  } else {
    const accepted = history.packageId ? history.acceptances.filter((record) => !record.illustrative).at(-1) : undefined;
    snapshot = accepted ? history.snapshots.find((candidate) => candidate.snapshotId === accepted.snapshot_id) ?? null : null;
  }
  const draft = snapshot ? await compareDraft(options, snapshot) : null;
  const status = snapshot ? snapshotStatus(snapshot.snapshotId, history.acceptances) : "unverified";
  const draftFailure = draft?.status === "unavailable" && draft.diagnostics.length > 0;
  const response = currentResponse(options, history, snapshot, draft);
  return finishResponse(options, response, renderCurrent(history, snapshot, draft), status === "accepted" && !errorsIn(history.diagnostics) && !draftFailure ? 0 : 1);
}

async function runContext(options: PlanCliOptions): Promise<PlanCliRunResult> {
  if (!options.snapshotId || !options.phaseId || !options.activity) throw new Error("context requires --snapshot, --phase, and --activity.");
  const loaded = await loadSnapshotContext(options, options.snapshotId);
  if (!loaded.context) {
    return unavailableResponse(
      options,
      "context",
      loaded.diagnostics.length > 0 ? loaded.diagnostics : [errorDiagnostic("snapshot-unavailable", `Snapshot '${options.snapshotId}' is unavailable.`, "snapshot_id")],
      `Snapshot '${options.snapshotId}' could not be reopened.`,
    );
  }
  const context = loaded.context;
  const status = snapshotStatus(context.snapshot.snapshotId, context.acceptances);
  const selected = selectContext({
    plan: context.snapshot.plan,
    snapshot: {
      package_id: context.snapshot.packageId,
      snapshot_id: context.snapshot.snapshotId,
      acceptance_status: status,
      files: context.snapshot.descriptor.files.map((file) => ({ id: file.id, available: file.available })),
    },
    phase_id: options.phaseId,
    activity: options.activity,
    prerequisite_results: prerequisiteResults(context.snapshot.plan, options.phaseId, context.snapshot.snapshotId, context.resultHistory),
  });
  if (!selected.value) {
    const output = [
      `# Plan context — ${context.snapshot.plan.title}`,
      "",
      "## Handoff status",
      "- status: INVALID — no context was produced.",
      ...renderProvenance({ packageId: context.snapshot.packageId, snapshotId: context.snapshot.snapshotId, revision: context.snapshot.revision, phaseId: options.phaseId, activity: options.activity, acceptance: status }),
      ...renderDiagnostics("Selection diagnostics", selected.diagnostics),
    ].join("\n") + "\n";
    const response = responseFor(options, {
      operation: "context",
      source: responseSource({ snapshot: context.snapshot, acceptance: status }),
      outcome: "error",
      diagnostics: publicDiagnostics([...context.diagnostics, ...selected.diagnostics]),
      coverage: "unavailable",
      completeness: "unavailable",
      readiness: responseReadiness("blocked", selected.diagnostics),
      data: { kind: "failure", message: "The requested context identity could not be resolved." },
    });
    return finishResponse(options, response, output, 1);
  }
  const draft = options.compareDraft ? await compareDraft(options, context.snapshot) : null;
  const full = renderContext(selected.value, context.resultHistory, status, draft, [...context.diagnostics, ...selected.diagnostics, ...(draft?.diagnostics ?? [])]);
  const diagnostics = [...context.diagnostics, ...selected.diagnostics, ...(draft?.diagnostics ?? [])];
  const response = contextResponse(options, context, selected.value, status, draft, diagnostics);
  const draftFailure = draft?.status === "unavailable" && draft.diagnostics.length > 0;
  return finishResponse(options, response, full, !selected.value.readiness.ready || errorsIn(context.diagnostics) || draftFailure ? 1 : 0);
}

async function runExpand(options: PlanCliOptions): Promise<PlanCliRunResult> {
  if (!options.snapshotId || options.refs.length === 0) throw new Error("expand requires --snapshot and at least one --refs ID.");
  const loaded = await loadSnapshotContext(options, options.snapshotId);
  if (!loaded.context) {
    return unavailableResponse(
      options,
      "expand",
      loaded.diagnostics.length > 0 ? loaded.diagnostics : [errorDiagnostic("snapshot-unavailable", `Snapshot '${options.snapshotId}' is unavailable.`, "snapshot_id")],
      `Snapshot '${options.snapshotId}' could not be reopened.`,
    );
  }
  const context = loaded.context;
  const requests = options.refs.map((raw) => expansionRequest(raw, context.snapshot.packageId, context.snapshot.snapshotId));
  const acceptance = snapshotStatus(context.snapshot.snapshotId, context.acceptances);
  const resolution = resolveExpand(context.snapshot, requests, context.diagnostics);
  const response = expandResponse(options, context, acceptance, resolution);
  const exitCode = errorsIn(resolution.diagnostics) || resolution.unavailable || errorsIn(context.snapshot.diagnostics) ? 1 : 0;
  return finishResponse(options, response, renderExpand(context.snapshot, resolution, acceptance), exitCode);
}

export async function runPlanCli(options: PlanCliOptions): Promise<PlanCliRunResult> {
  try {
    if (options.command === "current") return await runCurrent(options);
    if (options.command === "context") return await runContext(options);
    return await runExpand(options);
  } catch (error) {
    return unavailableResponse(options, options.command, [], error instanceof Error ? error.message : String(error));
  }
}

function argumentValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  const value = index >= 0 ? argv[index + 1] : undefined;
  return value && !value.startsWith("-") ? value : undefined;
}

function argumentFailureOptions(argv: readonly string[]): { options: PlanCliOptions; operation: PlanCliResponseOperation | null } {
  const command = argv[0];
  const operation = command === "current" || command === "context" || command === "expand" ? command : null;
  const formatValue = argumentValue(argv, "--format");
  const activityValue = argumentValue(argv, "--activity");
  const maxCharsValue = argumentValue(argv, "--max-chars") ?? argumentValue(argv, "--char-budget") ?? argumentValue(argv, "--budget");
  const maxChars = maxCharsValue && /^[1-9]\d*$/.test(maxCharsValue) ? Number(maxCharsValue) : undefined;
  return {
    operation,
    options: {
      command: operation ?? "current",
      packagePath: argumentValue(argv, "--package") ?? argumentValue(argv, "-p"),
      storePath: argumentValue(argv, "--store"),
      repositoryPath: argumentValue(argv, "--repository"),
      snapshotId: argumentValue(argv, "--snapshot") ?? argumentValue(argv, "--snapshot-id"),
      phaseId: argumentValue(argv, "--phase") ?? argumentValue(argv, "--phase-id"),
      activity: activityValue === "implement" || activityValue === "verify" ? activityValue : undefined,
      refs: [],
      ...(maxChars && Number.isSafeInteger(maxChars) ? { maxChars } : {}),
      compareDraft: argv.includes("--compare-draft"),
      format: formatValue === "markdown" ? "markdown" : "json",
    },
  };
}

function argumentFailure(argv: readonly string[], message: string): PlanCliRunResult {
  const { options, operation } = argumentFailureOptions(argv);
  const diagnostic = errorDiagnostic("invalid-arguments", message, "argv");
  const response = responseFor(options, {
    operation,
    source: responseSource({}),
    outcome: "error",
    diagnostics: publicDiagnostics([diagnostic]),
    coverage: "unavailable",
    completeness: "unavailable",
    readiness: responseReadiness("blocked", [diagnostic]),
    data: { kind: "failure", message },
  });
  return finishResponse(options, response, renderFailureMarkdown(operation, message, [diagnostic]), 2);
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const parsed = parsePlanCliArgs(argv);
  if (parsed.help) {
    console.log(usage(parsed.helpCommand));
    return 0;
  }
  if (!parsed.options) {
    const result = argumentFailure(argv, parsed.error ?? "Invalid command.");
    process.stdout.write(result.output);
    return result.exitCode;
  }
  const result = await runPlanCli(parsed.options);
  process.stdout.write(result.output);
  return result.exitCode;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = await main();
}
