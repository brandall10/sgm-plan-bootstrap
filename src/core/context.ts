import {
  errorDiagnostic,
  warningDiagnostic,
  type Diagnostic,
} from "./diagnostics.js";
import {
  CONTEXT_SELECTION_CAPABILITY,
  type AcceptanceCriterion,
  type Constraint,
  type ContextActivity,
  type Decision,
  type PackageAsset,
  type Phase,
  type PhaseTask,
  type PlanPackage,
  type Question,
  type Reference,
} from "./package.js";

export type { ContextActivity, PhaseTask } from "./package.js";

export const CONTEXT_FORMAT = "plan-package-context" as const;
export const CONTEXT_FORMAT_VERSION = "1" as const;

export type ContextMaterialClass = "governing" | "expandable";
export type ContextItemKind =
  | "plan"
  | "constraint"
  | "phase"
  | "phase-narrative"
  | "task"
  | "criterion"
  | "decision"
  | "question"
  | "reference"
  | "asset"
  | "prerequisite-result";
export type ContextAcceptanceStatus = "accepted" | "unverified" | "illustrative";
export type ContextDependencyResultStatus = "available" | "missing" | "incompatible" | "unresolved";

export interface ContextSnapshotFile {
  id: string;
  available: boolean;
}

/**
 * The selector has no authority to open a snapshot or acceptance record. The
 * caller supplies this identity and the verified file availability it has
 * already established.
 */
export interface ContextSnapshotIdentity {
  package_id: string;
  snapshot_id: string;
  accepted?: boolean;
  acceptance_status?: ContextAcceptanceStatus;
  illustrative?: boolean;
  available_file_ids?: readonly string[];
  unavailable_file_ids?: readonly string[];
  files?: readonly ContextSnapshotFile[];
}

export interface ContextPrerequisiteResult {
  phase_id: string;
  status: ContextDependencyResultStatus;
  result_id?: string;
  interface_ids?: readonly string[];
  unresolved_finding_ids?: readonly string[];
}

/**
 * Snake-case fields are the package-facing form. The scalar aliases keep the
 * core usable by a future local command without making that command part of
 * this phase.
 */
export interface ContextSelectionInput {
  plan: PlanPackage;
  snapshot?: ContextSnapshotIdentity;
  package_id?: string;
  snapshot_id?: string;
  phase_id?: string;
  activity?: string;
  accepted?: boolean;
  acceptance_status?: ContextAcceptanceStatus;
  illustrative?: boolean;
  available_file_ids?: readonly string[];
  prerequisite_results?: readonly ContextPrerequisiteResult[];
  packageId?: string;
  snapshotId?: string;
  phaseId?: string;
  availableFileIds?: readonly string[];
  prerequisiteResults?: readonly ContextPrerequisiteResult[];
}

export interface ContextSource {
  package_id: string;
  snapshot_id: string;
}

export interface ContextMaterialRef {
  id: string;
  kind: ContextItemKind;
  material: ContextMaterialClass;
  source: ContextSource;
  reason: string;
  owner_phase_id?: string;
}

export type ContextProvenance = ContextMaterialRef;

export interface ContextPhaseMapEntry {
  id: string;
  title: string;
  depends_on: string[];
  order: number;
}

export interface ContextSelectedCriterion extends AcceptanceCriterion {
  owner_phase_id: string;
}

export interface ContextSelectedPhase {
  id: string;
  title: string;
  depends_on: string[];
  objective_md: string;
  approach_md: string;
  tasks: PhaseTask[];
}

export interface ContextReadinessBlocker extends Diagnostic {
  kind: "snapshot" | "capability" | "availability" | "question" | "dependency" | "input";
}

export interface ContextReadiness {
  ready: boolean;
  blockers: ContextReadinessBlocker[];
}

export interface ContextSelection {
  format: typeof CONTEXT_FORMAT;
  format_version: typeof CONTEXT_FORMAT_VERSION;
  package_id: string;
  snapshot_id: string;
  revision: number;
  activity: ContextActivity;
  phase_id: string;
  source: ContextSource;
  snapshot: {
    package_id: string;
    snapshot_id: string;
    acceptance_status: ContextAcceptanceStatus;
  };
  plan: {
    id: string;
    title: string;
    revision: number;
    goal_md: string;
    scope: { included: string[]; excluded: string[] };
  };
  goal_md: string;
  scope: { included: string[]; excluded: string[] };
  phase_map: ContextPhaseMapEntry[];
  phase: ContextSelectedPhase;
  current_phase: ContextSelectedPhase;
  constraints: Constraint[];
  criteria: ContextSelectedCriterion[];
  tasks: PhaseTask[];
  decisions: Decision[];
  questions: Question[];
  references: Reference[];
  assets: PackageAsset[];
  prerequisite_phases: ContextPhaseMapEntry[];
  prerequisite_results: ContextPrerequisiteResult[];
  governing_file_ids: string[];
  governing: ContextMaterialRef[];
  expandable: ContextMaterialRef[];
  provenance: ContextProvenance[];
  selected_item_ids: string[];
  coverage: "complete" | "limited";
  limitations: Diagnostic[];
  readiness: ContextReadiness;
}

export interface ContextSelectionResult {
  valid: boolean;
  value: ContextSelection | null;
  diagnostics: Diagnostic[];
}

function cloneScope(plan: PlanPackage): { included: string[]; excluded: string[] } {
  return { included: [...plan.scope.included], excluded: [...plan.scope.excluded] };
}

function cloneCriterion(criterion: AcceptanceCriterion): AcceptanceCriterion {
  return {
    id: criterion.id,
    text_md: criterion.text_md,
    ...(criterion.applies_to ? { applies_to: [...criterion.applies_to] } : {}),
  };
}

function cloneTask(task: PhaseTask): PhaseTask {
  return { id: task.id, text_md: task.text_md, activity: task.activity };
}

function cloneDecision(decision: Decision): Decision {
  return {
    id: decision.id,
    title: decision.title,
    decision_md: decision.decision_md,
    ...(decision.rationale_md ? { rationale_md: decision.rationale_md } : {}),
    applies_to: [...decision.applies_to],
  };
}

function cloneQuestion(question: Question): Question {
  return {
    id: question.id,
    title: question.title,
    question_md: question.question_md,
    status: question.status,
    blocking: question.blocking,
    applies_to: [...question.applies_to],
  };
}

function cloneReference(reference: Reference): Reference {
  return { ...reference, applies_to: [...reference.applies_to] };
}

function cloneAsset(asset: PackageAsset): PackageAsset {
  return {
    ...asset,
    applies_to: [...asset.applies_to],
    dependency_file_ids: [...asset.dependency_file_ids],
  };
}

function clonePhaseMapEntry(phase: Phase, order: number): ContextPhaseMapEntry {
  return { id: phase.id, title: phase.title, depends_on: [...phase.depends_on], order };
}

function normalizeSnapshot(input: ContextSelectionInput): ContextSnapshotIdentity {
  if (input.snapshot) return input.snapshot;
  return {
    package_id: input.package_id ?? input.packageId ?? input.plan.id,
    snapshot_id: input.snapshot_id ?? input.snapshotId ?? "",
    ...(input.accepted === undefined ? {} : { accepted: input.accepted }),
    ...(input.acceptance_status ? { acceptance_status: input.acceptance_status } : {}),
    ...(input.illustrative === undefined ? {} : { illustrative: input.illustrative }),
    ...(input.available_file_ids ?? input.availableFileIds
      ? { available_file_ids: input.available_file_ids ?? input.availableFileIds }
      : {}),
  };
}

function normalizePhaseId(input: ContextSelectionInput): string {
  return input.phase_id ?? input.phaseId ?? "";
}

function normalizeActivity(input: ContextSelectionInput): string {
  return input.activity ?? "";
}

function normalizePrerequisiteResults(input: ContextSelectionInput): readonly ContextPrerequisiteResult[] {
  return input.prerequisite_results ?? input.prerequisiteResults ?? [];
}

function phaseTargets(appliesTo: readonly string[] | undefined, phaseId: string, selectedCriterionIds: ReadonlySet<string>): boolean {
  if (!appliesTo || appliesTo.length === 0) return true;
  return appliesTo.some((target) => target === phaseId || selectedCriterionIds.has(target));
}

function criterionTargets(criterion: AcceptanceCriterion, ownerPhaseId: string, phaseId: string, currentCriterionIds: ReadonlySet<string>): boolean {
  // A criterion remains an obligation of its owning phase. Explicit targets
  // add consumer phases/criteria that must receive its exact wording.
  if (ownerPhaseId === phaseId) return true;
  return criterion.applies_to?.some((target) => target === phaseId || currentCriterionIds.has(target)) ?? false;
}

function snapshotStatus(snapshot: ContextSnapshotIdentity): ContextAcceptanceStatus {
  if (snapshot.illustrative) return "illustrative";
  if (snapshot.acceptance_status) return snapshot.acceptance_status;
  return snapshot.accepted === true ? "accepted" : "unverified";
}

function availableFileIds(snapshot: ContextSnapshotIdentity): Set<string> | null {
  const ids = snapshot.available_file_ids
    ? new Set(snapshot.available_file_ids)
    : snapshot.files
      ? new Set(snapshot.files.filter((file) => file.available).map((file) => file.id))
      : null;
  if (!ids || !snapshot.unavailable_file_ids) return ids;
  for (const fileId of snapshot.unavailable_file_ids) ids.delete(fileId);
  return ids;
}

function blocker(
  kind: ContextReadinessBlocker["kind"],
  code: string,
  message: string,
  path: string,
  itemId?: string,
): ContextReadinessBlocker {
  return { ...errorDiagnostic(code, message, path, itemId), kind };
}

function dependencyDiagnostics(plan: PlanPackage): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const phaseById = new Map(plan.phases.map((phase) => [phase.id, phase]));
  for (const [index, phase] of plan.phases.entries()) {
    for (const [dependencyIndex, dependency] of phase.depends_on.entries()) {
      if (!phaseById.has(dependency)) {
        diagnostics.push(errorDiagnostic(
          "unknown-dependency",
          `Phase dependency '${dependency}' does not identify a declared phase.`,
          `phases[${index}].depends_on[${dependencyIndex}]`,
          phase.id,
        ));
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const reported = new Set<string>();
  const visit = (phase: Phase, stack: string[]): void => {
    if (visiting.has(phase.id)) {
      const cycleStart = stack.indexOf(phase.id);
      const cycle = [...stack.slice(cycleStart), phase.id].join(" -> ");
      if (!reported.has(cycle)) {
        diagnostics.push(errorDiagnostic(
          "dependency-cycle",
          `Phase dependency cycle detected: ${cycle}.`,
          `phases.${phase.id}.depends_on`,
          phase.id,
        ));
        reported.add(cycle);
      }
      return;
    }
    if (visited.has(phase.id)) return;
    visiting.add(phase.id);
    for (const dependency of phase.depends_on) {
      const dependencyPhase = phaseById.get(dependency);
      if (dependencyPhase) visit(dependencyPhase, [...stack, phase.id]);
    }
    visiting.delete(phase.id);
    visited.add(phase.id);
  };
  for (const phase of plan.phases) visit(phase, []);
  return diagnostics;
}

function applicabilityDiagnostics(plan: PlanPackage): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const phaseIds = new Set(plan.phases.map((phase) => phase.id));
  const criterionIds = new Set(plan.phases.flatMap((phase) => phase.acceptance_criteria.map((criterion) => criterion.id)));
  const targets = new Set([...phaseIds, ...criterionIds]);
  const check = (appliesTo: readonly string[] | undefined, path: string, itemId: string): void => {
    for (const [index, target] of (appliesTo ?? []).entries()) {
      if (!targets.has(target)) {
        diagnostics.push(errorDiagnostic(
          "unknown-applicability-target",
          `Applicability target '${target}' is undeclared.`,
          `${path}[${index}]`,
          itemId,
        ));
      }
    }
  };
  for (const [phaseIndex, phase] of plan.phases.entries()) {
    for (const [criterionIndex, criterion] of phase.acceptance_criteria.entries()) {
      check(criterion.applies_to, `phases[${phaseIndex}].acceptance_criteria[${criterionIndex}].applies_to`, criterion.id);
    }
  }
  for (const [index, reference] of plan.references.entries()) check(reference.applies_to, `references[${index}].applies_to`, reference.id);
  for (const [index, asset] of plan.assets.entries()) check(asset.applies_to, `assets[${index}].applies_to`, asset.id);
  for (const [index, decision] of plan.decisions.entries()) check(decision.applies_to, `decisions[${index}].applies_to`, decision.id);
  for (const [index, question] of plan.questions.entries()) check(question.applies_to, `questions[${index}].applies_to`, question.id);
  return diagnostics;
}

function taskDiagnostics(plan: PlanPackage): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const [phaseIndex, phase] of plan.phases.entries()) {
    for (const [taskIndex, task] of (phase.tasks ?? []).entries()) {
      if (task.activity !== "implement" && task.activity !== "verify") {
        diagnostics.push(errorDiagnostic(
          "invalid-task-activity",
          `activity must be implement or verify, received '${String(task.activity)}'.`,
          `phases[${phaseIndex}].tasks[${taskIndex}].activity`,
          task.id,
        ));
      }
    }
  }
  return diagnostics;
}

function materialKey(kind: ContextItemKind, id: string): string {
  return `${kind}:${id}`;
}

/**
 * Resolve one declared phase from one identified snapshot. This function is
 * deliberately synchronous and side-effect free: persistence, acceptance,
 * file hashing, and result-record verification belong to the runtime layers.
 */
export function selectContext(input: ContextSelectionInput): ContextSelectionResult {
  const snapshot = normalizeSnapshot(input);
  const phaseId = normalizePhaseId(input);
  const activityValue = normalizeActivity(input);
  const diagnostics = [
    ...dependencyDiagnostics(input.plan),
    ...applicabilityDiagnostics(input.plan),
    ...taskDiagnostics(input.plan),
  ];

  if (!snapshot.snapshot_id) diagnostics.push(errorDiagnostic("snapshot-required", "Context selection requires an identified snapshot.", "snapshot_id"));
  if (snapshot.package_id !== input.plan.id) {
    diagnostics.push(errorDiagnostic(
      "snapshot-package-mismatch",
      `Snapshot package '${snapshot.package_id}' does not match plan '${input.plan.id}'.`,
      "snapshot.package_id",
      input.plan.id,
    ));
  }
  if (activityValue !== "implement" && activityValue !== "verify") {
    diagnostics.push(errorDiagnostic(
      "invalid-activity",
      `Context activity must be implement or verify, received '${activityValue}'.`,
      "activity",
    ));
  }
  const phase = input.plan.phases.find((candidate) => candidate.id === phaseId);
  if (!phase) diagnostics.push(errorDiagnostic("unknown-phase", `Phase '${phaseId}' is not declared in the package.`, "phase_id", phaseId || undefined));
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error") || !phase || (activityValue !== "implement" && activityValue !== "verify")) {
    return { valid: false, value: null, diagnostics };
  }
  const activity = activityValue as ContextActivity;
  const source: ContextSource = { package_id: input.plan.id, snapshot_id: snapshot.snapshot_id };
  const phaseOrder = new Map(input.plan.phases.map((candidate, index) => [candidate.id, index]));
  const phaseMap = input.plan.phases.map((candidate, index) => clonePhaseMapEntry(candidate, index));
  const currentCriterionIds = new Set(phase.acceptance_criteria.map((criterion) => criterion.id));
  const criteria: ContextSelectedCriterion[] = [];
  const selectedCriterionIds = new Set<string>();
  for (const ownerPhase of input.plan.phases) {
    for (const criterion of ownerPhase.acceptance_criteria) {
      if (criterionTargets(criterion, ownerPhase.id, phase.id, currentCriterionIds)) {
        criteria.push({ ...cloneCriterion(criterion), owner_phase_id: ownerPhase.id });
        selectedCriterionIds.add(criterion.id);
      }
    }
  }
  const allTasks = phase.tasks ?? [];
  const tasks = allTasks.filter((task) => task.activity === activity).map(cloneTask);
  const decisions = input.plan.decisions
    .filter((decision) => phaseTargets(decision.applies_to, phase.id, selectedCriterionIds))
    .map(cloneDecision);
  const questions = input.plan.questions
    .filter((question) => phaseTargets(question.applies_to, phase.id, selectedCriterionIds))
    .map(cloneQuestion);
  const references = input.plan.references
    .filter((reference) => phaseTargets(reference.applies_to, phase.id, selectedCriterionIds))
    .map(cloneReference);
  const assets = input.plan.assets
    .filter((asset) => phaseTargets(asset.applies_to, phase.id, selectedCriterionIds))
    .map(cloneAsset);
  const prerequisitePhases = phase.depends_on
    .map((dependency) => {
      const dependencyPhase = input.plan.phases.find((candidate) => candidate.id === dependency);
      const order = dependencyPhase ? phaseOrder.get(dependencyPhase.id) ?? 0 : 0;
      return dependencyPhase ? clonePhaseMapEntry(dependencyPhase, order) : null;
    })
    .filter((candidate): candidate is ContextPhaseMapEntry => candidate !== null);
  const suppliedResults = new Map(normalizePrerequisiteResults(input).map((result) => [result.phase_id, result]));
  const prerequisiteResults: ContextPrerequisiteResult[] = phase.depends_on.map((dependency) => {
    const supplied = suppliedResults.get(dependency);
    return supplied
      ? {
        phase_id: supplied.phase_id,
        status: supplied.status,
        ...(supplied.result_id ? { result_id: supplied.result_id } : {}),
        ...(supplied.interface_ids ? { interface_ids: [...supplied.interface_ids] } : {}),
        ...(supplied.unresolved_finding_ids ? { unresolved_finding_ids: [...supplied.unresolved_finding_ids] } : {}),
      }
      : { phase_id: dependency, status: "missing" };
  });

  const governing: ContextMaterialRef[] = [];
  const expandable: ContextMaterialRef[] = [];
  const provenance = new Map<string, ContextMaterialRef>();
  const addMaterial = (id: string, kind: ContextItemKind, material: ContextMaterialClass, reason: string, ownerPhaseId?: string): void => {
    const key = materialKey(kind, id);
    const existing = provenance.get(key);
    const resolvedMaterial = existing?.material === "governing" || material === "governing" ? "governing" : "expandable";
    const ref: ContextMaterialRef = {
      id,
      kind,
      material: resolvedMaterial,
      source,
      reason,
      ...(ownerPhaseId ? { owner_phase_id: ownerPhaseId } : {}),
    };
    provenance.set(key, ref);
  };
  addMaterial(input.plan.id, "plan", "governing", "Plan identity and accepted scope.");
  for (const constraint of input.plan.constraints) addMaterial(constraint.id, "constraint", "governing", "Shared constraint.");
  for (const mappedPhase of phaseMap) addMaterial(mappedPhase.id, "phase", "governing", "Brief phase map entry.");
  addMaterial(phase.id, "phase", "governing", "Current phase objective, approach, and selected tasks.");
  for (const task of allTasks) {
    addMaterial(task.id, "task", task.activity === activity ? "governing" : "expandable", task.activity === activity ? "Task for the requested activity." : `Task for ${task.activity} activity.`, phase.id);
  }
  for (const ownerPhase of input.plan.phases) {
    for (const criterion of ownerPhase.acceptance_criteria) {
      addMaterial(
        criterion.id,
        "criterion",
        selectedCriterionIds.has(criterion.id) ? "governing" : "expandable",
        selectedCriterionIds.has(criterion.id) ? "Applicable exact acceptance criterion." : "Acceptance criterion for another phase; expand explicitly if needed.",
        ownerPhase.id,
      );
    }
    if (ownerPhase.id !== phase.id) addMaterial(ownerPhase.id, "phase-narrative", "expandable", "Other phase narrative is omitted from the focused selection.", ownerPhase.id);
  }
  for (const decision of input.plan.decisions) addMaterial(decision.id, "decision", decisions.some((selected) => selected.id === decision.id) ? "governing" : "expandable", "Decision applicability can be expanded explicitly.");
  for (const question of input.plan.questions) addMaterial(question.id, "question", questions.some((selected) => selected.id === question.id) ? "governing" : "expandable", "Question applicability can be expanded explicitly.");
  const selectedReferenceIds = new Set(references.map((reference) => reference.id));
  const selectedAssetIds = new Set(assets.map((asset) => asset.id));
  for (const reference of input.plan.references) addMaterial(reference.id, "reference", selectedReferenceIds.has(reference.id) && reference.required ? "governing" : "expandable", reference.required ? "Required reference for the selected material." : "Optional reference; expand explicitly when useful.");
  for (const asset of input.plan.assets) addMaterial(asset.id, "asset", selectedAssetIds.has(asset.id) && asset.required && asset.authority === "authoritative" ? "governing" : "expandable", asset.authority === "authoritative" ? "Selected authoritative design material." : "Illustrative or evidence material; expand explicitly when useful.");
  for (const result of prerequisiteResults) addMaterial(`result:${result.phase_id}`, "prerequisite-result", "governing", "Declared prerequisite result slot.", result.phase_id);

  for (const ref of provenance.values()) {
    if (ref.material === "governing") governing.push(ref);
    else expandable.push(ref);
  }

  const readinessBlockers: ContextReadinessBlocker[] = [];
  const acceptance = snapshotStatus(snapshot);
  if (acceptance === "illustrative") readinessBlockers.push(blocker("snapshot", "illustrative-snapshot", "An illustrative snapshot cannot provide executable context.", "snapshot_id", snapshot.snapshot_id));
  else if (acceptance !== "accepted") readinessBlockers.push(blocker("snapshot", "snapshot-acceptance-unverified", "A context handoff requires a real accepted snapshot; package state alone is not acceptance.", "snapshot_id", snapshot.snapshot_id));

  const contextCapability = input.plan.required_capabilities.includes(CONTEXT_SELECTION_CAPABILITY);
  const limitations: Diagnostic[] = [];
  if (!contextCapability) {
    const limitation = warningDiagnostic("context-capability-missing", "This v1 package has no declared context-selection capability; selected coverage is limited to legacy phase semantics.", "required_capabilities");
    limitations.push(limitation);
    readinessBlockers.push(blocker("capability", limitation.code, limitation.message, limitation.path));
  }
  for (const [index, taskPhase] of input.plan.phases.entries()) {
    if (contextCapability && (taskPhase.tasks ?? []).length === 0) {
      readinessBlockers.push(blocker("capability", "missing-context-tasks", `Context-capable phase '${taskPhase.id}' has no activity-tagged tasks.`, `phases[${index}].tasks`, taskPhase.id));
    }
  }
  for (const question of questions) {
    if (question.blocking && question.status !== "answered") {
      readinessBlockers.push(blocker("question", "blocking-question", `Blocking question '${question.title}' is ${question.status} and unresolved.`, `questions.${question.id}`, question.id));
    }
  }
  for (const result of prerequisiteResults) {
    if (result.status === "missing") readinessBlockers.push(blocker("dependency", "missing-prerequisite-result", `Prerequisite phase '${result.phase_id}' has no retained result for this handoff.`, `prerequisite_results.${result.phase_id}`, result.phase_id));
    if (result.status === "incompatible") readinessBlockers.push(blocker("dependency", "incompatible-prerequisite-result", `Prerequisite phase '${result.phase_id}' has an incompatible retained result.`, `prerequisite_results.${result.phase_id}`, result.phase_id));
    if (result.status === "unresolved") readinessBlockers.push(blocker("dependency", "unresolved-prerequisite-result", `Prerequisite phase '${result.phase_id}' has an unresolved retained result.`, `prerequisite_results.${result.phase_id}`, result.phase_id));
  }

  const requiredFiles: Array<{ fileId: string; itemId: string; kind: "reference" | "asset" }> = [];
  for (const reference of references) {
    if (!reference.required) continue;
    if (reference.kind === "local") requiredFiles.push({ fileId: reference.file_id, itemId: reference.id, kind: "reference" });
    else if (reference.local_file_id) requiredFiles.push({ fileId: reference.local_file_id, itemId: reference.id, kind: "reference" });
    else readinessBlockers.push(blocker("availability", "required-external-reference-unavailable", `Required external reference '${reference.id}' has no retained local copy.`, `references.${reference.id}`, reference.id));
  }
  for (const asset of assets) {
    if (!asset.required || asset.authority !== "authoritative") continue;
    requiredFiles.push({ fileId: asset.file_id, itemId: asset.id, kind: "asset" });
    for (const dependency of asset.dependency_file_ids) requiredFiles.push({ fileId: dependency, itemId: asset.id, kind: "asset" });
  }
  const available = availableFileIds(snapshot);
  const governingFileIds = [...new Set(requiredFiles.map((entry) => entry.fileId))].sort();
  for (const entry of requiredFiles) {
    if (!available) {
      readinessBlockers.push(blocker("availability", "governing-file-availability-unknown", `Availability of governing file '${entry.fileId}' was not supplied for this snapshot.`, `files.${entry.fileId}`, entry.itemId));
    } else if (!available.has(entry.fileId)) {
      readinessBlockers.push(blocker("availability", "governing-file-unavailable", `Governing ${entry.kind} file '${entry.fileId}' is unavailable in this snapshot.`, `files.${entry.fileId}`, entry.itemId));
    }
  }
  const selectedPhase: ContextSelectedPhase = {
    id: phase.id,
    title: phase.title,
    depends_on: [...phase.depends_on],
    objective_md: phase.objective_md,
    approach_md: phase.approach_md,
    tasks,
  };
  const orderedProvenance = [...provenance.values()];
  const selection: ContextSelection = {
    format: CONTEXT_FORMAT,
    format_version: CONTEXT_FORMAT_VERSION,
    package_id: input.plan.id,
    snapshot_id: snapshot.snapshot_id,
    revision: input.plan.revision,
    activity,
    phase_id: phase.id,
    source,
    snapshot: {
      package_id: snapshot.package_id,
      snapshot_id: snapshot.snapshot_id,
      acceptance_status: acceptance,
    },
    plan: {
      id: input.plan.id,
      title: input.plan.title,
      revision: input.plan.revision,
      goal_md: input.plan.goal_md,
      scope: cloneScope(input.plan),
    },
    goal_md: input.plan.goal_md,
    scope: cloneScope(input.plan),
    phase_map: phaseMap,
    phase: selectedPhase,
    current_phase: {
      ...selectedPhase,
      depends_on: [...selectedPhase.depends_on],
      tasks: selectedPhase.tasks.map(cloneTask),
    },
    constraints: input.plan.constraints.map((constraint) => ({ id: constraint.id, text_md: constraint.text_md })),
    criteria,
    tasks: tasks.map(cloneTask),
    decisions,
    questions,
    references,
    assets,
    prerequisite_phases: prerequisitePhases,
    prerequisite_results: prerequisiteResults,
    governing_file_ids: governingFileIds,
    governing,
    expandable,
    provenance: orderedProvenance,
    selected_item_ids: orderedProvenance.filter((item) => item.material === "governing").map((item) => item.id),
    coverage: contextCapability && !readinessBlockers.some((item) => item.code === "missing-context-tasks") ? "complete" : "limited",
    limitations,
    readiness: { ready: readinessBlockers.length === 0, blockers: readinessBlockers },
  };
  return { valid: true, value: selection, diagnostics };
}

/** Explicit alias for callers that name the operation after its phase focus. */
export const selectPhaseContext = selectContext;
