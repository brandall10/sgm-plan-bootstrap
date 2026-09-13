import { createHash } from "node:crypto";

import { errorDiagnostic, type Diagnostic } from "./diagnostics.js";
import type {
  AcceptanceCriterion,
  Decision,
  PackageAsset,
  Phase,
  PlanPackage,
  Question,
  Reference,
} from "./package.js";
import { isSnapshotId, type SnapshotDescriptor, type SnapshotFileEntry } from "./snapshot.js";

export const COMPARISON_FORMAT = "plan-package-comparison" as const;
export const COMPARISON_FORMAT_VERSION = "1" as const;

export type ComparisonChangeKind = "added" | "removed" | "changed";
export type ComparisonChangeClass = "material" | "metadata";
export type ComparisonCategory =
  | "goal"
  | "scope"
  | "constraint"
  | "phase"
  | "criterion"
  | "decision"
  | "question"
  | "reference"
  | "asset"
  | "file"
  | "metadata";

export interface SnapshotComparisonInput {
  snapshot_id: string;
  package_id: string;
  plan: PlanPackage;
  descriptor: SnapshotDescriptor;
  files: ReadonlyMap<string, Uint8Array>;
}

export interface ComparisonSnapshotRef {
  snapshot_id: string;
  package_id: string;
  revision: number;
  content_id: string;
}

export interface ComparisonUnavailableInput {
  snapshot_id: string;
  file_id: string;
  path: string;
  message: string;
}

export interface ComparisonChange {
  category: ComparisonCategory;
  id: string;
  item_id: string;
  kind: ComparisonChangeKind;
  classification: ComparisonChangeClass;
  fields: string[];
  old_value: unknown | null;
  new_value: unknown | null;
  old_snapshot_id: string;
  new_snapshot_id: string;
  affected_asset_ids: string[];
  affected_item_ids: string[];
}

export interface SnapshotComparison {
  format: typeof COMPARISON_FORMAT;
  format_version: typeof COMPARISON_FORMAT_VERSION;
  from: ComparisonSnapshotRef;
  to: ComparisonSnapshotRef;
  changes: ComparisonChange[];
  material_change_count: number;
  metadata_change_count: number;
  unavailable_inputs: ComparisonUnavailableInput[];
}

export interface SnapshotComparisonResult {
  valid: boolean;
  value: SnapshotComparison | null;
  diagnostics: Diagnostic[];
}

type Identified = { id: string };
type CriterionWithPhase = AcceptanceCriterion & { phase_id: string; order: number };

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);
  return `{${entries.join(",")}}`;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((key) => stableStringify(before[key]) !== stableStringify(after[key])).sort();
}

function changeBase(
  category: ComparisonCategory,
  id: string,
  kind: ComparisonChangeKind,
  classification: ComparisonChangeClass,
  fields: string[],
  oldValue: unknown | null,
  newValue: unknown | null,
  left: SnapshotComparisonInput,
  right: SnapshotComparisonInput,
  affectedItemIds: string[] = [],
  affectedAssetIds: string[] = [],
): ComparisonChange {
  return {
    category,
    id,
    item_id: id,
    kind,
    classification,
    fields,
    old_value: oldValue,
    new_value: newValue,
    old_snapshot_id: left.snapshot_id,
    new_snapshot_id: right.snapshot_id,
    affected_asset_ids: affectedAssetIds,
    affected_item_ids: affectedItemIds,
  };
}

function compareValue(
  category: ComparisonCategory,
  id: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  left: SnapshotComparisonInput,
  right: SnapshotComparisonInput,
  classification: ComparisonChangeClass = "material",
  affectedItemIds: string[] = [],
): ComparisonChange | null {
  const fields = changedFields(before, after);
  return fields.length > 0
    ? changeBase(category, id, "changed", classification, fields, before, after, left, right, affectedItemIds)
    : null;
}

function compareCollection<T extends Identified>(
  category: ComparisonCategory,
  before: readonly T[],
  after: readonly T[],
  left: SnapshotComparisonInput,
  right: SnapshotComparisonInput,
  project: (value: T) => Record<string, unknown> = (value) => value as Record<string, unknown>,
  affectedItems: (value: T) => string[] = () => [],
): ComparisonChange[] {
  const beforeById = new Map(before.map((value) => [value.id, value]));
  const afterById = new Map(after.map((value) => [value.id, value]));
  const ids = [...new Set([...beforeById.keys(), ...afterById.keys()])].sort();
  const changes: ComparisonChange[] = [];
  for (const id of ids) {
    const oldValue = beforeById.get(id);
    const newValue = afterById.get(id);
    if (!oldValue && newValue) {
      changes.push(changeBase(category, id, "added", "material", Object.keys(project(newValue)).sort(), null, project(newValue), left, right, affectedItems(newValue)));
    } else if (oldValue && !newValue) {
      changes.push(changeBase(category, id, "removed", "material", Object.keys(project(oldValue)).sort(), project(oldValue), null, left, right, affectedItems(oldValue)));
    } else if (oldValue && newValue) {
      const change = compareValue(category, id, project(oldValue), project(newValue), left, right, "material", affectedItems(newValue));
      if (change) changes.push(change);
    }
  }
  return changes;
}

function phaseWithoutCriteria(phase: Phase): Record<string, unknown> {
  const { acceptance_criteria: _criteria, ...value } = phase;
  return value;
}

function criteria(plan: PlanPackage): CriterionWithPhase[] {
  return plan.phases.flatMap((phase) => phase.acceptance_criteria.map((criterion, order) => ({ ...criterion, phase_id: phase.id, order })));
}

function phasesWithOrder(plan: PlanPackage): Array<Record<string, unknown> & Identified> {
  return plan.phases.map((phase, order) => ({ ...phaseWithoutCriteria(phase), id: phase.id, order }));
}

function assetAffectedItems(asset: PackageAsset): string[] {
  return [...asset.applies_to].sort();
}

function fileAffectedAssets(plan: PlanPackage, fileId: string): { assetIds: string[]; itemIds: string[] } {
  const assets = plan.assets.filter((asset) => asset.file_id === fileId || asset.dependency_file_ids.includes(fileId));
  return {
    assetIds: assets.map((asset) => asset.id).sort(),
    itemIds: [...new Set(assets.flatMap((asset) => [asset.id, ...asset.applies_to]))].sort(),
  };
}

function fileValue(entry: SnapshotFileEntry, bytes: Uint8Array | undefined): Record<string, unknown> {
  return {
    id: entry.id,
    root: entry.root,
    path: entry.path,
    sha256: entry.sha256,
    required: entry.required,
    available: entry.available,
    ...(entry.blob_sha256 ? { blob_sha256: entry.blob_sha256 } : {}),
    ...(entry.media_type ? { media_type: entry.media_type } : {}),
    ...(entry.omission ? { omission: entry.omission } : {}),
    ...(bytes ? { captured_sha256: sha256(bytes) } : {}),
  };
}

function compareFiles(left: SnapshotComparisonInput, right: SnapshotComparisonInput, diagnostics: Diagnostic[], unavailable: ComparisonUnavailableInput[]): ComparisonChange[] {
  const beforeById = new Map(left.descriptor.files.map((file) => [file.id, file]));
  const afterById = new Map(right.descriptor.files.map((file) => [file.id, file]));
  const ids = [...new Set([...beforeById.keys(), ...afterById.keys()])].sort();
  const changes: ComparisonChange[] = [];
  for (const id of ids) {
    const oldEntry = beforeById.get(id);
    const newEntry = afterById.get(id);
    const oldBytes = oldEntry?.available ? left.files.get(id) : undefined;
    const newBytes = newEntry?.available ? right.files.get(id) : undefined;
    if (oldEntry?.available && !oldBytes) {
      const input = { snapshot_id: left.snapshot_id, file_id: id, path: oldEntry.path, message: `Captured bytes for '${oldEntry.path}' are unavailable.` } satisfies ComparisonUnavailableInput;
      unavailable.push(input);
      diagnostics.push(errorDiagnostic("comparison-input-unavailable", input.message, `files.${id}`, id));
    }
    if (newEntry?.available && !newBytes) {
      const input = { snapshot_id: right.snapshot_id, file_id: id, path: newEntry.path, message: `Captured bytes for '${newEntry.path}' are unavailable.` } satisfies ComparisonUnavailableInput;
      unavailable.push(input);
      diagnostics.push(errorDiagnostic("comparison-input-unavailable", input.message, `files.${id}`, id));
    }
    if (oldBytes && sha256(oldBytes) !== oldEntry?.sha256) diagnostics.push(errorDiagnostic("comparison-input-digest-mismatch", `Captured bytes for '${oldEntry?.path ?? id}' do not match their snapshot digest.`, `files.${id}`, id));
    if (newBytes && sha256(newBytes) !== newEntry?.sha256) diagnostics.push(errorDiagnostic("comparison-input-digest-mismatch", `Captured bytes for '${newEntry?.path ?? id}' do not match their snapshot digest.`, `files.${id}`, id));
    const impact = {
      assetIds: [...new Set([...fileAffectedAssets(left.plan, id).assetIds, ...fileAffectedAssets(right.plan, id).assetIds])].sort(),
      itemIds: [...new Set([...fileAffectedAssets(left.plan, id).itemIds, ...fileAffectedAssets(right.plan, id).itemIds])].sort(),
    };
    if (!oldEntry && newEntry) {
      changes.push(changeBase("file", id, "added", "material", Object.keys(fileValue(newEntry, newBytes)).sort(), null, fileValue(newEntry, newBytes), left, right, impact.itemIds, impact.assetIds));
    } else if (oldEntry && !newEntry) {
      changes.push(changeBase("file", id, "removed", "material", Object.keys(fileValue(oldEntry, oldBytes)).sort(), fileValue(oldEntry, oldBytes), null, left, right, impact.itemIds, impact.assetIds));
    } else if (oldEntry && newEntry) {
      const change = compareValue("file", id, fileValue(oldEntry, oldBytes), fileValue(newEntry, newBytes), left, right, "material", impact.itemIds);
      if (change) {
        change.affected_asset_ids = impact.assetIds;
        changes.push(change);
      }
    }
  }
  return changes;
}

function inputDiagnostics(input: SnapshotComparisonInput): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!isSnapshotId(input.snapshot_id)) diagnostics.push(errorDiagnostic("invalid-snapshot-id", `Snapshot ID '${input.snapshot_id}' is invalid.`, "snapshot_id"));
  if (input.package_id !== input.plan.id) diagnostics.push(errorDiagnostic("comparison-package-mismatch", "Comparison input package_id does not match its plan.", "package_id"));
  if (input.descriptor.snapshot_id !== input.snapshot_id) diagnostics.push(errorDiagnostic("snapshot-id-mismatch", "Comparison input descriptor identity does not match its snapshot ID.", "snapshot_id"));
  if (input.descriptor.package_id !== input.package_id) diagnostics.push(errorDiagnostic("snapshot-package-mismatch", "Comparison input descriptor package_id does not match its package ID.", "package_id"));
  return diagnostics;
}

function metadataValue(input: SnapshotComparisonInput): Record<string, unknown> {
  return {
    revision: input.plan.revision,
    state: input.plan.state,
    metadata: input.plan.metadata ?? null,
  };
}

/**
 * Compare two already verified snapshots without resolving live package paths.
 * The function deliberately reports captured-byte availability instead of
 * inventing content when a caller supplies an incomplete projection.
 */
export function compareSnapshots(left: SnapshotComparisonInput, right: SnapshotComparisonInput): SnapshotComparisonResult {
  const diagnostics = [...inputDiagnostics(left), ...inputDiagnostics(right)];
  if (left.package_id !== right.package_id) {
    diagnostics.push(errorDiagnostic("comparison-package-mismatch", `Cannot compare package '${left.package_id}' with package '${right.package_id}'.`, "package_id"));
    return { valid: false, value: null, diagnostics };
  }

  const unavailableInputs: ComparisonUnavailableInput[] = [];
  const changes: ComparisonChange[] = [];
  const leftPlan = left.plan;
  const rightPlan = right.plan;
  const goalBefore = { title: leftPlan.title, goal_md: leftPlan.goal_md };
  const goalAfter = { title: rightPlan.title, goal_md: rightPlan.goal_md };
  const goalChange = compareValue("goal", leftPlan.id, goalBefore, goalAfter, left, right);
  if (goalChange) changes.push(goalChange);
  const scopeChange = compareValue("scope", leftPlan.id, { ...leftPlan.scope }, { ...rightPlan.scope }, left, right);
  if (scopeChange) changes.push(scopeChange);
  changes.push(...compareCollection("constraint", leftPlan.constraints, rightPlan.constraints, left, right));
  changes.push(...compareCollection("phase", phasesWithOrder(leftPlan), phasesWithOrder(rightPlan), left, right));
  changes.push(...compareCollection("criterion", criteria(leftPlan), criteria(rightPlan), left, right, (criterion) => criterion as unknown as Record<string, unknown>, (criterion) => [criterion.phase_id]));
  changes.push(...compareCollection("decision", leftPlan.decisions, rightPlan.decisions, left, right, (decision: Decision) => decision as unknown as Record<string, unknown>, (decision) => decision.applies_to));
  changes.push(...compareCollection("question", leftPlan.questions, rightPlan.questions, left, right, (question: Question) => question as unknown as Record<string, unknown>, (question) => question.applies_to));
  changes.push(...compareCollection("reference", leftPlan.references, rightPlan.references, left, right, (reference: Reference) => reference as unknown as Record<string, unknown>, (reference) => reference.applies_to));
  changes.push(...compareCollection("asset", leftPlan.assets, rightPlan.assets, left, right, (asset: PackageAsset) => asset as unknown as Record<string, unknown>, assetAffectedItems));
  changes.push(...compareFiles(left, right, diagnostics, unavailableInputs));

  const metadataBefore = metadataValue(left);
  const metadataAfter = metadataValue(right);
  const metadataChange = compareValue("metadata", leftPlan.id, metadataBefore, metadataAfter, left, right, "metadata");
  if (metadataChange) changes.push(metadataChange);

  const materialChanges = changes.some((change) => change.classification === "material");
  if (left.descriptor.manifest_sha256 !== right.descriptor.manifest_sha256 && !materialChanges) {
    const existingMetadata = changes.find((change) => change.category === "metadata" && change.id === leftPlan.id);
    if (existingMetadata) {
      existingMetadata.fields = [...new Set([...existingMetadata.fields, "serialization"])].sort();
      existingMetadata.old_value = { ...metadataBefore, manifest_sha256: left.descriptor.manifest_sha256 };
      existingMetadata.new_value = { ...metadataAfter, manifest_sha256: right.descriptor.manifest_sha256 };
    } else {
      changes.push(changeBase(
        "metadata",
        leftPlan.id,
        "changed",
        "metadata",
        ["serialization"],
        { manifest_sha256: left.descriptor.manifest_sha256 },
        { manifest_sha256: right.descriptor.manifest_sha256 },
        left,
        right,
      ));
    }
  }

  changes.sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id));
  const value: SnapshotComparison = {
    format: COMPARISON_FORMAT,
    format_version: COMPARISON_FORMAT_VERSION,
    from: { snapshot_id: left.snapshot_id, package_id: left.package_id, revision: left.plan.revision, content_id: left.descriptor.content_id },
    to: { snapshot_id: right.snapshot_id, package_id: right.package_id, revision: right.plan.revision, content_id: right.descriptor.content_id },
    changes,
    material_change_count: changes.filter((change) => change.classification === "material").length,
    metadata_change_count: changes.filter((change) => change.classification === "metadata").length,
    unavailable_inputs: unavailableInputs,
  };
  return { valid: diagnostics.every((diagnostic) => diagnostic.severity !== "error"), value, diagnostics };
}

export const comparePlanSnapshots = compareSnapshots;
