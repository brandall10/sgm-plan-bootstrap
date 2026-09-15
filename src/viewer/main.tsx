import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ReactElement, ReactNode } from "react";

import type { Diagnostic } from "../core/diagnostics.js";
import type {
  AcceptanceCriterion,
  Constraint,
  Decision,
  PackageAsset,
  PackageFile,
  Phase,
  PlanPackage,
  Question,
} from "../core/package.js";
import type {
  ResultEvidence,
  ResultEvidenceStatus,
  ResultFinding,
  ResultInterface,
  ResultRecord,
  ResultStatement,
} from "../core/result.js";
import type { AcceptanceRecord } from "../core/snapshot.js";
import { SafeMarkdown, safeHref } from "./safe-markdown.js";

import "./styles.css";

interface ViewerModel {
  package: PlanPackage;
  package_id: string;
  revision: number;
  content_id: string;
  view_kind: "draft" | "snapshot";
  view_id: string;
  readiness: "reviewable" | "reviewable-with-planning-blockers";
  acceptance_status: "unverified" | "accepted" | "illustrative";
  acceptance_provenance: AcceptanceRecord | null;
  acceptance_records: AcceptanceRecord[];
  diagnostics: Diagnostic[];
  planning_blockers: Diagnostic[];
  files: PackageFile[];
  snapshot_id: string | null;
  acceptances: AcceptanceRecord[];
  results: RuntimeResultProjection[];
  phase_results: RuntimePhaseResultAvailability[];
  result_diagnostics: Diagnostic[];
}

interface RuntimeResultProjection {
  record: ResultRecord;
  status: "current" | "superseded";
  evidence_status: ResultEvidenceStatus;
  acceptance_status: "unverified" | "accepted" | "illustrative";
}

interface RuntimePhaseResultActivity {
  activity: "implement" | "verify";
  current_result_ids: string[];
  historical_result_ids: string[];
}

interface RuntimePhaseResultAvailability {
  phase_id: string;
  activities: RuntimePhaseResultActivity[];
}

interface RuntimeState {
  packageId: string | null;
  currentCandidateId: string | null;
  currentSnapshotId: string | null;
  currentRevision: number | null;
  defaultView: RuntimeViewReference;
  diagnostics: Diagnostic[];
  planningBlockers: Diagnostic[];
  acceptances: AcceptanceRecord[];
  acceptanceDiagnostics: Diagnostic[];
  lastAttempt: "published" | "rejected" | null;
}

type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "offline";

type ViewSelection =
  | { kind: "default" }
  | { kind: "draft" }
  | { kind: "snapshot"; snapshotId: string };

interface RuntimeViewReference {
  kind: "draft" | "snapshot";
  snapshot_id: string | null;
  candidate_id: string | null;
}

interface ComparisonChange {
  category: string;
  id: string;
  item_id: string;
  kind: "added" | "removed" | "changed";
  classification: "material" | "metadata";
  fields: string[];
  old_value: unknown | null;
  new_value: unknown | null;
  old_snapshot_id: string;
  new_snapshot_id: string;
  affected_asset_ids: string[];
  affected_item_ids: string[];
}

interface ComparisonProjection {
  format: string;
  from: { snapshot_id: string; package_id: string; revision: number; content_id: string };
  to: { snapshot_id: string; package_id: string; revision: number; content_id: string };
  changes: ComparisonChange[];
  material_change_count: number;
  metadata_change_count: number;
  unavailable_inputs: Array<{ snapshot_id: string; file_id: string; path: string; message: string }>;
  diagnostics?: Diagnostic[];
}

interface ComparisonResponse {
  valid: boolean;
  value: ComparisonProjection | null;
  diagnostics: Diagnostic[];
}

interface CompareRoute {
  fromSnapshotId: string;
  toView: ViewSelection;
}

interface Route {
  packageId: string | null;
  itemId: string | null;
  view: ViewSelection;
  compare: CompareRoute | null;
}

type AddressedKind = "asset" | "constraint" | "criterion" | "decision" | "phase" | "question";

interface AddressedItem {
  id: string;
  kind: AddressedKind;
  label: string;
  asset?: PackageAsset;
  constraint?: Constraint;
  criterion?: AcceptanceCriterion;
  decision?: Decision;
  phase?: Phase;
  question?: Question;
}

function decodeRoutePart(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function parseRoute(hash: string): Route {
  const emptyRoute = (): Route => ({ packageId: null, itemId: null, view: { kind: "default" }, compare: null });
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] !== "packages") return emptyRoute();
  const packageId = decodeRoutePart(parts[1]);
  if (parts.length === 2) return { packageId, itemId: null, view: { kind: "default" }, compare: null };
  if (parts[2] === "items" && parts.length === 4) return { packageId, itemId: decodeRoutePart(parts[3]), view: { kind: "default" }, compare: null };
  if (parts[2] === "draft" && (parts.length === 3 || (parts[3] === "items" && parts.length === 5))) {
    return { packageId, itemId: parts.length === 5 ? decodeRoutePart(parts[4]) : null, view: { kind: "draft" }, compare: null };
  }
  if (parts[2] === "snapshots" && parts[3] && (parts.length === 4 || (parts[4] === "items" && parts.length === 6))) {
    const snapshotId = decodeRoutePart(parts[3]);
    if (!snapshotId) return { packageId, itemId: "__invalid-route__", view: { kind: "default" }, compare: null };
    return { packageId, itemId: parts.length === 6 ? decodeRoutePart(parts[5]) : null, view: { kind: "snapshot", snapshotId }, compare: null };
  }
  if (parts[2] === "compare" && parts.length === 5) {
    const fromSnapshotId = decodeRoutePart(parts[3]);
    const toToken = decodeRoutePart(parts[4]);
    const toView = toToken === "draft" ? { kind: "draft" as const } : toToken ? { kind: "snapshot" as const, snapshotId: toToken } : null;
    if (fromSnapshotId && toView) return { packageId, itemId: null, view: toView, compare: { fromSnapshotId, toView } };
  }
  return { packageId, itemId: "__invalid-route__", view: { kind: "default" }, compare: null };
}

function routeFor(packageId: string, itemId?: string, view: ViewSelection | null = null): string {
  const viewRoute = view?.kind === "draft"
    ? "/draft"
    : view?.kind === "snapshot"
      ? `/snapshots/${encodeURIComponent(view.snapshotId)}`
      : "";
  const packageRoute = `#/packages/${encodeURIComponent(packageId)}${viewRoute}`;
  return itemId ? `${packageRoute}/items/${encodeURIComponent(itemId)}` : packageRoute;
}

function comparisonRouteFor(packageId: string, fromSnapshotId: string, toView: ViewSelection): string {
  const target = toView.kind === "draft" ? "draft" : toView.kind === "snapshot" ? toView.snapshotId : "draft";
  return `#/packages/${encodeURIComponent(packageId)}/compare/${encodeURIComponent(fromSnapshotId)}/${encodeURIComponent(target)}`;
}

function modelView(model: ViewerModel): ViewSelection {
  return model.view_kind === "snapshot" && model.snapshot_id
    ? { kind: "snapshot", snapshotId: model.snapshot_id }
    : { kind: "draft" };
}

function activeView(): ViewSelection | null {
  const view = parseRoute(window.location.hash).view;
  return view.kind === "default" ? null : view;
}

function itemIndex(plan: PlanPackage): Map<string, AddressedItem> {
  const items = new Map<string, AddressedItem>();
  for (const constraint of plan.constraints) {
    items.set(constraint.id, { id: constraint.id, kind: "constraint", label: "Shared constraint", constraint });
  }
  for (const phase of plan.phases) {
    items.set(phase.id, { id: phase.id, kind: "phase", label: phase.title, phase });
    for (const criterion of phase.acceptance_criteria) {
      items.set(criterion.id, { id: criterion.id, kind: "criterion", label: criterion.text_md, phase, criterion });
    }
  }
  for (const decision of plan.decisions) {
    items.set(decision.id, { id: decision.id, kind: "decision", label: decision.title, decision });
  }
  for (const question of plan.questions) {
    items.set(question.id, { id: question.id, kind: "question", label: question.title, question });
  }
  for (const asset of plan.assets) {
    items.set(asset.id, { id: asset.id, kind: "asset", label: asset.id, asset });
  }
  return items;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: "no-store" });
  if (!response.ok) throw new Error(`${path} returned ${response.status}.`);
  return response.json() as Promise<T>;
}

function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "error" | "info" | "neutral" | "warning" }): ReactElement {
  return <span className={`chip chip--${tone}`}>{children}</span>;
}

function ItemLink({ packageId, itemId, children }: { packageId: string; itemId: string; children: ReactNode }): ReactElement {
  return <a href={routeFor(packageId, itemId, activeView())}>{children}</a>;
}

function ItemId({ packageId, itemId }: { packageId: string; itemId: string }): ReactElement {
  return <ItemLink packageId={packageId} itemId={itemId}><code>{itemId}</code></ItemLink>;
}

function DiagnosticPanel({ diagnostics }: { diagnostics: readonly Diagnostic[] }): ReactElement {
  if (diagnostics.length === 0) {
    return <p className="diagnostics-clear" data-testid="diagnostics-clear">No unresolved runtime diagnostics.</p>;
  }
  const hasErrors = diagnostics.some((diagnostic) => diagnostic.severity === "error");
  return (
    <section aria-label="Runtime diagnostics" className={`diagnostics ${hasErrors ? "diagnostics--error" : ""}`} data-testid="diagnostics">
      <h2>{hasErrors ? "Current package diagnostics" : "Review notes"}</h2>
      <ul>
        {diagnostics.map((diagnostic) => (
          <li key={`${diagnostic.code}-${diagnostic.path}`}>
            <Chip tone={diagnostic.severity === "error" ? "error" : diagnostic.severity === "warning" ? "warning" : "info"}>{diagnostic.severity}</Chip>
            <strong>{diagnostic.code}</strong>
            <span>{diagnostic.message}</span>
            <code>{diagnostic.path}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RuntimeStatus({ connection, state, transportError }: {
  connection: ConnectionStatus;
  state: RuntimeState | null;
  transportError?: string | null;
}): ReactElement {
  const connectionTone = connection === "connected" ? "info" : connection === "offline" ? "error" : "warning";
  const connectionLabel = connection === "connected" ? "connected" : connection === "reconnecting" ? "reconnecting" : connection;
  return (
    <section aria-live="polite" className={`runtime-status runtime-status--${connection}`} data-testid="runtime-status">
      <p>
        <Chip tone={connectionTone}>
          <span data-testid="connection-status">Live refresh · {connectionLabel}</span>
        </Chip>
      </p>
      {state?.lastAttempt === "rejected"
        ? <p data-testid="last-valid-notice">The current edit was rejected; showing the last valid revision {state.currentRevision ?? "(none)"}. Diagnostics below describe the rejected candidate.</p>
        : null}
      {transportError ? <p role="alert">{transportError}</p> : null}
    </section>
  );
}

function ScopeLists({ plan }: { plan: PlanPackage }): ReactElement {
  return (
    <div className="scope-grid">
      <section aria-labelledby="included-heading">
        <h3 id="included-heading">In scope</h3>
        <ul>{plan.scope.included.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
      <section aria-labelledby="excluded-heading">
        <h3 id="excluded-heading">Explicitly excluded</h3>
        <ul>{plan.scope.excluded.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
    </div>
  );
}

function PhaseNavigator({ packageId, phases, selectedPhaseId }: { packageId: string; phases: Phase[]; selectedPhaseId?: string }): ReactElement {
  return (
    <nav aria-label="Plan phases" className="phase-navigator">
      <h2>Phases</h2>
      <ol>
        {phases.map((phase) => (
          <li key={phase.id}>
            <ItemLink packageId={packageId} itemId={phase.id}>{phase.title}</ItemLink>
            {selectedPhaseId === phase.id ? <span aria-current="page" className="sr-only">Current phase</span> : null}
            <small><code>{phase.id}</code></small>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function DependencyMap({ packageId, phases }: { packageId: string; phases: Phase[] }): ReactElement {
  const titleById = new Map(phases.map((phase) => [phase.id, phase.title]));
  return (
    <section aria-labelledby="phase-map-heading" className="dependency-map">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Structured relationships</p>
          <h2 id="phase-map-heading">Phase map</h2>
        </div>
        <p>Each phase and dependency is generated from the saved package.</p>
      </div>
      <ol className="phase-map-nodes">
        {phases.map((phase) => (
          <li key={phase.id}>
            <ItemLink packageId={packageId} itemId={phase.id}>{phase.title}</ItemLink>
            <code>{phase.id}</code>
            {phase.depends_on.length === 0
              ? <p>Ready without a package dependency.</p>
              : <p>Depends on {phase.depends_on.map((dependency, index) => (
                <span key={dependency}>{index > 0 ? ", " : ""}<ItemLink packageId={packageId} itemId={dependency}>{titleById.get(dependency) ?? dependency}</ItemLink></span>
              ))}.</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function appliesToPhase(entry: { applies_to: string[] }, phase: Phase): boolean {
  return entry.applies_to.some((id) => id === phase.id || phase.acceptance_criteria.some((criterion) => criterion.id === id));
}

function ApplicabilityLinks({ packageId, itemIds }: { packageId: string; itemIds: string[] }): ReactElement {
  return (
    <ul className="applicability-links" aria-label="Applies to">
      {itemIds.map((itemId) => <li key={itemId}><ItemId packageId={packageId} itemId={itemId} /></li>)}
    </ul>
  );
}

function DecisionQuestionPanel({ packageId, plan, phase }: { packageId: string; plan: PlanPackage; phase?: Phase }): ReactElement | null {
  const decisions = phase ? plan.decisions.filter((decision) => appliesToPhase(decision, phase)) : plan.decisions;
  const questions = phase ? plan.questions.filter((question) => appliesToPhase(question, phase)) : plan.questions;
  if (decisions.length === 0 && questions.length === 0) return null;
  return (
    <section aria-labelledby="decisions-heading" className="decision-question-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Consequential package content</p>
          <h2 id="decisions-heading">Decisions and questions</h2>
        </div>
      </div>
      {decisions.map((decision) => (
        <article id={`item-${decision.id}`} key={decision.id}>
          <h3><ItemLink packageId={packageId} itemId={decision.id}>{decision.title}</ItemLink></h3>
          <p className="item-id"><ItemId packageId={packageId} itemId={decision.id} /></p>
          <SafeMarkdown source={decision.decision_md} />
          {decision.rationale_md ? <details data-item-id={decision.id}><summary>Rationale</summary><SafeMarkdown source={decision.rationale_md} /></details> : null}
          <p className="applies-label">Applies to</p>
          <ApplicabilityLinks packageId={packageId} itemIds={decision.applies_to} />
        </article>
      ))}
      {questions.map((question) => (
        <article id={`item-${question.id}`} key={question.id}>
          <h3><ItemLink packageId={packageId} itemId={question.id}>{question.title}</ItemLink></h3>
          <p className="item-id"><ItemId packageId={packageId} itemId={question.id} /></p>
          <p><Chip tone={question.blocking ? "error" : "warning"}>{question.status === "open" ? (question.blocking ? "Open · blocking" : "Open · non-blocking") : question.status}</Chip></p>
          <SafeMarkdown source={question.question_md} />
          <p className="applies-label">Applies to</p>
          <ApplicabilityLinks packageId={packageId} itemIds={question.applies_to} />
        </article>
      ))}
    </section>
  );
}

function resultDispositionTone(disposition: ResultStatement["disposition"]): "error" | "info" | "neutral" | "warning" {
  if (disposition === "observed") return "info";
  if (disposition === "unverified") return "error";
  if (disposition === "intended") return "warning";
  return "neutral";
}

function resultEvidenceTone(status: ResultEvidenceStatus): "error" | "info" | "neutral" | "warning" {
  if (status === "current") return "info";
  if (status === "stale") return "warning";
  if (status === "unavailable") return "error";
  return "neutral";
}

function ResultStatementList({ idPrefix, title, statements }: { idPrefix: string; title: string; statements: readonly ResultStatement[] }): ReactElement | null {
  if (statements.length === 0) return null;
  const headingId = `${idPrefix}-${title.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <section className="result-section" aria-labelledby={headingId}>
      <h4 id={headingId}>{title}</h4>
      <ul className="result-item-list">
        {statements.map((statement) => (
          <li key={statement.id}>
            <p className="result-item-heading"><Chip tone={resultDispositionTone(statement.disposition)}>{statement.disposition}</Chip> <code>{statement.id}</code></p>
            <SafeMarkdown source={statement.text_md} />
            {statement.related_item_ids.length > 0 ? <p className="result-related">Related package items: {statement.related_item_ids.map((itemId) => <code key={itemId}>{itemId}</code>)}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ResultInterfaceList({ idPrefix, interfaces }: { idPrefix: string; interfaces: readonly ResultInterface[] }): ReactElement | null {
  if (interfaces.length === 0) return null;
  const headingId = `${idPrefix}-produced-interfaces`;
  return (
    <section className="result-section" aria-labelledby={headingId}>
      <h4 id={headingId}>Produced interfaces</h4>
      <ul className="result-item-list">
        {interfaces.map((item) => (
          <li key={item.id}>
            <p className="result-item-heading"><Chip tone={resultDispositionTone(item.disposition)}>{item.disposition}</Chip> <code>{item.id}</code> <strong>{item.name}</strong></p>
            <SafeMarkdown source={item.description_md} />
            {item.related_item_ids.length > 0 ? <p className="result-related">Related package items: {item.related_item_ids.map((itemId) => <code key={itemId}>{itemId}</code>)}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ResultFindingList({ idPrefix, findings }: { idPrefix: string; findings: readonly ResultFinding[] }): ReactElement | null {
  if (findings.length === 0) return null;
  const headingId = `${idPrefix}-findings`;
  return (
    <section className="result-section result-section--limitations" aria-labelledby={headingId}>
      <h4 id={headingId}>Unresolved findings and limitations</h4>
      <ul className="result-item-list">
        {findings.map((finding) => (
          <li key={finding.id}>
            <p className="result-item-heading"><Chip tone={finding.severity === "blocking" ? "error" : "warning"}>{finding.severity}</Chip> <Chip tone={resultDispositionTone(finding.disposition)}>{finding.disposition}</Chip> <code>{finding.id}</code></p>
            <SafeMarkdown source={finding.text_md} />
            {finding.related_item_ids.length > 0 ? <p className="result-related">Related package items: {finding.related_item_ids.map((itemId) => <code key={itemId}>{itemId}</code>)}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function EvidenceLocator({ evidence }: { evidence: ResultEvidence }): ReactElement {
  const href = safeHref(evidence.locator);
  return href
    ? <a href={href} rel={href.startsWith("#") ? undefined : "noreferrer"} target={href.startsWith("#") ? undefined : "_blank"}>{evidence.locator}</a>
    : <code>{evidence.locator}</code>;
}

function ResultEvidenceList({ evidence }: { evidence: readonly ResultEvidence[] }): ReactElement {
  if (evidence.length === 0) {
    return <p className="result-empty-note">No evidence links were recorded; this absence is not a success claim.</p>;
  }
  return (
    <ul className="result-evidence-list">
      {evidence.map((item) => (
        <li data-testid={`result-evidence-${item.id}`} key={item.id}>
          <p className="result-item-heading"><Chip tone={resultEvidenceTone(item.status)}>{item.status}</Chip> <strong>{item.label}</strong> <Chip>{item.kind}</Chip></p>
          <dl className="result-evidence-metadata">
            <div><dt>Locator</dt><dd><EvidenceLocator evidence={item} /></dd></div>
            <div><dt>Code revision</dt><dd><code>{item.code_revision}</code></dd></div>
            <div><dt>Supports</dt><dd>{item.statement_ids.map((statementId) => <code key={statementId}>{statementId}</code>)}</dd></div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

function deliveryTone(status: string): "error" | "info" | "neutral" | "warning" {
  if (status === "approved" || status === "integrated") return "info";
  if (status === "changes-requested") return "error";
  if (status === "not-reviewed" || status === "pending" || status === "not-integrated" || status === "unknown") return "warning";
  return "neutral";
}

function ResultDeliveryFacts({ record }: { record: ResultRecord }): ReactElement {
  const { delivery_facts: delivery } = record;
  return (
    <section className="result-section" aria-labelledby={`result-delivery-${record.result_id}`}>
      <h4 id={`result-delivery-${record.result_id}`}>Review and integration facts</h4>
      <dl className="result-delivery">
        <div><dt>Review</dt><dd><Chip tone={deliveryTone(delivery.review_status)}>{delivery.review_status}</Chip></dd></div>
        <div><dt>Integration</dt><dd><Chip tone={deliveryTone(delivery.integration_status)}>{delivery.integration_status}</Chip></dd></div>
        {delivery.pr_url ? <div><dt>Pull request</dt><dd><a href={delivery.pr_url} rel="noreferrer" target="_blank">{delivery.pr_url}</a></dd></div> : null}
        {delivery.integrated_revision ? <div><dt>Integrated revision</dt><dd><code>{delivery.integrated_revision}</code></dd></div> : null}
      </dl>
      {delivery.notes_md ? <SafeMarkdown source={delivery.notes_md} /> : null}
    </section>
  );
}

function ResultRecordCard({ projection }: { projection: RuntimeResultProjection }): ReactElement {
  const { record } = projection;
  return (
    <article className={`result-record result-record--${projection.status}`} data-testid={`result-record-${record.result_id}`}>
      <header className="result-record__header">
        <div>
          <p className="eyebrow">Execution record</p>
          <h3 id={`result-heading-${record.result_id}`}>{record.result_id}</h3>
        </div>
        <div className="result-labels">
          <Chip tone={projection.status === "current" ? "info" : "neutral"}>{projection.status}</Chip>
          <Chip tone={projection.acceptance_status === "accepted" ? "info" : "warning"}>{projection.acceptance_status}</Chip>
          <Chip>{record.activity}</Chip>
          {record.illustrative ? <Chip tone="warning">illustrative fixture</Chip> : null}
        </div>
      </header>
      <dl className="result-metadata">
        <div><dt>Phase</dt><dd><code>{record.phase_id}</code></dd></div>
        <div><dt>Source snapshot</dt><dd><code>{record.snapshot_id}</code></dd></div>
        <div><dt>Code revision</dt><dd><code>{record.code_revision}</code></dd></div>
        <div><dt>Recorded by</dt><dd><code>{record.author}</code></dd></div>
        <div><dt>Recorded at</dt><dd><time dateTime={record.recorded_at}>{record.recorded_at}</time></dd></div>
        <div><dt>Evidence status</dt><dd><Chip tone={resultEvidenceTone(projection.evidence_status)}>{projection.evidence_status}</Chip></dd></div>
      </dl>
      <div className="result-record__body">
        <ResultStatementList idPrefix={record.result_id} title="Intended work" statements={record.intended_work} />
        <ResultStatementList idPrefix={record.result_id} title="Observed facts" statements={record.observed_facts} />
        <ResultStatementList idPrefix={record.result_id} title="Inferences" statements={record.inferences} />
        <ResultStatementList idPrefix={record.result_id} title="Unverified claims" statements={record.unverified_claims} />
        <ResultInterfaceList idPrefix={record.result_id} interfaces={record.produced_interfaces} />
        <ResultStatementList idPrefix={record.result_id} title="Deviations" statements={record.deviations} />
        <section className="result-section" aria-labelledby={`result-evidence-heading-${record.result_id}`}>
          <h4 id={`result-evidence-heading-${record.result_id}`}>Evidence</h4>
          <ResultEvidenceList evidence={record.evidence} />
        </section>
        <ResultFindingList idPrefix={record.result_id} findings={record.unresolved_findings} />
        <ResultStatementList idPrefix={record.result_id} title="Continuation notes" statements={record.continuation_notes} />
        <ResultDeliveryFacts record={record} />
      </div>
    </article>
  );
}

function ResultAvailability({ model }: { model: ViewerModel }): ReactElement | null {
  if (model.phase_results.length === 0) return null;
  return (
    <section className="result-availability" aria-labelledby="result-availability-heading">
      <h3 id="result-availability-heading">Result availability by phase</h3>
      <ul>
        {model.phase_results.map((phaseResults) => {
          const phase = model.package.phases.find((candidate) => candidate.id === phaseResults.phase_id);
          return (
            <li key={phaseResults.phase_id}>
              <div><ItemLink packageId={model.package_id} itemId={phaseResults.phase_id}>{phase?.title ?? phaseResults.phase_id}</ItemLink> <code>{phaseResults.phase_id}</code></div>
              <ul className="result-availability__activities">
                {phaseResults.activities.map((activity) => (
                  <li key={activity.activity}>
                    <strong>{activity.activity}</strong>
                    {activity.current_result_ids.length > 0
                      ? <span><Chip tone="info">{activity.current_result_ids.length} current</Chip> {activity.current_result_ids.map((resultId) => <code key={resultId}>{resultId}</code>)}</span>
                      : activity.historical_result_ids.length > 0
                        ? <span><Chip tone="warning">no current result</Chip> {activity.historical_result_ids.map((resultId) => <code key={resultId}>{resultId}</code>)}</span>
                        : <span className="result-empty-note">No retained result</span>}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ResultPanel({ model, phaseId }: { model: ViewerModel; phaseId?: string }): ReactElement {
  const records = model.results.filter((projection) => !phaseId || projection.record.phase_id === phaseId);
  const headingId = phaseId ? `phase-results-heading-${phaseId}` : "execution-results-heading";
  return (
    <section aria-labelledby={headingId} className="result-panel" data-testid={phaseId ? "phase-results" : "execution-results"}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Read-only product history</p>
          <h2 id={headingId}>{phaseId ? "Execution results for this phase" : "Execution results"}</h2>
        </div>
        <p>{phaseId ? "Retained observations for this phase, attributed to the selected snapshot and activity." : "Retained observations are separate from the proposal and do not turn a fixture into a delivered product."}</p>
      </div>
      {!phaseId ? <ResultAvailability model={model} /> : null}
      {records.length === 0
        ? <p className="result-empty" role="status">No retained result records are available for this {phaseId ? "phase" : "snapshot"}. This is not a success claim.</p>
        : <div className="result-record-list">{records.map((projection) => <ResultRecordCard key={projection.record.result_id} projection={projection} />)}</div>}
      {model.result_diagnostics.length > 0 ? <DiagnosticPanel diagnostics={model.result_diagnostics} /> : null}
    </section>
  );
}

function assetUrl(model: ViewerModel, assetId: string): string {
  const base = model.view_kind === "snapshot" && model.snapshot_id
    ? `/api/snapshots/${encodeURIComponent(model.snapshot_id)}`
    : `/api/candidates/${encodeURIComponent(model.content_id)}`;
  return `${base}/assets/${encodeURIComponent(assetId)}`;
}

function prototypeUrl(model: ViewerModel, assetId: string): string {
  const base = model.view_kind === "snapshot" && model.snapshot_id
    ? `/api/snapshots/${encodeURIComponent(model.snapshot_id)}`
    : `/api/candidates/${encodeURIComponent(model.content_id)}`;
  return `${base}/prototypes/${encodeURIComponent(assetId)}/`;
}

function ArtifactFrame({ model, asset }: {
  model: ViewerModel;
  asset: PackageAsset;
}): ReactElement {
  const file = model.files.find((candidate) => candidate.id === asset.file_id);
  return (
    <article className="artifact-frame" id={`item-${asset.id}`}>
      <div className="artifact-frame__header">
        <div>
          <p className="eyebrow">Selected artifact</p>
          <h3><ItemLink packageId={model.package_id} itemId={asset.id}>{asset.id}</ItemLink></h3>
        </div>
        <div className="artifact-labels">
          <Chip tone={asset.authority === "authoritative" ? "info" : "neutral"}>{asset.authority}</Chip>
          {asset.mock ? <Chip tone="warning">Mock behavior</Chip> : <Chip>Design artifact</Chip>}
        </div>
      </div>
      <SafeMarkdown source={asset.purpose_md} />
      <dl className="artifact-metadata">
        <div><dt>Package revision</dt><dd>{model.revision}</dd></div>
        <div><dt>Source file</dt><dd><code>{file?.path ?? asset.file_id}</code></dd></div>
        <div><dt>Format</dt><dd>{asset.format}</dd></div>
      </dl>
      {asset.format === "svg"
        ? <figure><img alt={`Diagram: ${asset.purpose_md}`} src={assetUrl(model, asset.id)} /><figcaption>Generated from the {model.view_kind === "snapshot" ? "pinned snapshot" : "working draft"} <code>{model.view_id}</code>.</figcaption></figure>
        : asset.format === "html"
          ? <figure className="prototype-figure"><iframe data-testid={`prototype-${asset.id}`} referrerPolicy="no-referrer" sandbox="allow-scripts" src={prototypeUrl(model, asset.id)} title={`Isolated mock prototype: ${asset.id}`} /><figcaption>The prototype is a sandboxed, {model.view_kind === "snapshot" ? "snapshot-scoped" : "draft-scoped"} mock. It cannot access viewer controls or claim to operate the underlying product.</figcaption></figure>
          : <p className="artifact-unavailable" role="status">This viewer can describe the declared <code>{asset.format}</code> artifact, but cannot safely render it inline.</p>}
      <p className="applies-label">Governs or explains</p>
      <ApplicabilityLinks packageId={model.package_id} itemIds={asset.applies_to} />
    </article>
  );
}

function ArtifactList({ model, phase }: { model: ViewerModel; phase?: Phase }): ReactElement | null {
  const assets = phase ? model.package.assets.filter((asset) => appliesToPhase(asset, phase)) : model.package.assets;
  if (assets.length === 0) return null;
  return (
    <section aria-labelledby="artifacts-heading" className="artifact-list">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Retained visual material</p>
          <h2 id="artifacts-heading">Designs and artifacts</h2>
        </div>
      </div>
      {assets.map((asset) => <ArtifactFrame asset={asset} key={asset.id} model={model} />)}
    </section>
  );
}

function SharedContext({ plan, packageId }: { plan: PlanPackage; packageId: string }): ReactElement {
  return (
    <aside aria-labelledby="shared-context-heading" className="shared-context">
      <p className="eyebrow">Plan context remains available</p>
      <h2 id="shared-context-heading">{plan.title}</h2>
      <SafeMarkdown source={plan.goal_md} />
      <h3>Shared constraints</h3>
      <ul>{plan.constraints.map((constraint) => <li id={`item-${constraint.id}`} key={constraint.id}><ItemId packageId={packageId} itemId={constraint.id} /> — {constraint.text_md}</li>)}</ul>
    </aside>
  );
}

function PhaseDetail({ model, phase, highlightedCriterionId }: { model: ViewerModel; phase: Phase; highlightedCriterionId?: string }): ReactElement {
  return (
    <>
      <SharedContext packageId={model.package_id} plan={model.package} />
      <article aria-labelledby="phase-title" className="phase-detail" id={`item-${phase.id}`}>
        <p className="eyebrow">Phase</p>
        <h1 id="phase-title">{phase.title}</h1>
        <p className="item-id"><ItemId packageId={model.package_id} itemId={phase.id} /></p>
        <section>
          <h2>Outcome</h2>
          <SafeMarkdown source={phase.objective_md} />
        </section>
        <section>
          <h2>Approach</h2>
          <SafeMarkdown source={phase.approach_md} />
        </section>
        <section aria-labelledby="criteria-heading">
          <h2 id="criteria-heading">Acceptance criteria</h2>
          <ol className="criterion-list">
            {phase.acceptance_criteria.map((criterion) => (
              <li className={criterion.id === highlightedCriterionId ? "criterion--highlighted" : ""} id={`item-${criterion.id}`} key={criterion.id}>
                <ItemId packageId={model.package_id} itemId={criterion.id} />
                <SafeMarkdown source={criterion.text_md} />
              </li>
            ))}
          </ol>
        </section>
        {phase.depends_on.length > 0 ? <section><h2>Package dependencies</h2><ApplicabilityLinks packageId={model.package_id} itemIds={phase.depends_on} /></section> : null}
      </article>
      <DecisionQuestionPanel packageId={model.package_id} phase={phase} plan={model.package} />
      <ArtifactList model={model} phase={phase} />
      <ResultPanel model={model} phaseId={phase.id} />
    </>
  );
}

function Overview({ model }: { model: ViewerModel }): ReactElement {
  const plan = model.package;
  return (
    <>
      <article aria-labelledby="overview-title" className="overview">
        <p className="eyebrow">Overview</p>
        <h1 id="overview-title">{plan.title}</h1>
        <SafeMarkdown source={plan.goal_md} />
        <ScopeLists plan={plan} />
        <section aria-labelledby="constraints-heading">
          <h2 id="constraints-heading">Shared constraints</h2>
          <ul className="constraint-list">
            {plan.constraints.map((constraint) => <li id={`item-${constraint.id}`} key={constraint.id}><ItemId packageId={model.package_id} itemId={constraint.id} /> <SafeMarkdown source={constraint.text_md} /></li>)}
          </ul>
        </section>
      </article>
      <DependencyMap packageId={model.package_id} phases={plan.phases} />
      <ResultPanel model={model} />
      <DecisionQuestionPanel packageId={model.package_id} plan={plan} />
      <ArtifactList model={model} />
    </>
  );
}

function TargetDetail({ item, model }: { item: AddressedItem; model: ViewerModel }): ReactElement | null {
  if (item.kind === "phase" || item.kind === "criterion") return null;
  if (item.kind === "asset" && item.asset) {
    return <section aria-label="Linked artifact" className="target-detail"><ArtifactFrame asset={item.asset} model={model} /></section>;
  }
  if (item.kind === "constraint" && item.constraint) {
    return <aside className="target-detail" id={`item-${item.id}`}><p className="eyebrow">Shared constraint</p><h2><ItemId packageId={model.package_id} itemId={item.id} /></h2><SafeMarkdown source={item.constraint.text_md} /></aside>;
  }
  if (item.kind === "decision" && item.decision) {
    return <aside className="target-detail" id={`item-${item.id}`}><p className="eyebrow">Decision</p><h2>{item.decision.title}</h2><SafeMarkdown source={item.decision.decision_md} /><ApplicabilityLinks packageId={model.package_id} itemIds={item.decision.applies_to} /></aside>;
  }
  if (item.kind === "question" && item.question) {
    return <aside className="target-detail" id={`item-${item.id}`}><p className="eyebrow">Question</p><h2>{item.question.title}</h2><p><Chip tone={item.question.blocking ? "error" : "warning"}>{item.question.blocking ? "Blocking" : "Non-blocking"}</Chip></p><SafeMarkdown source={item.question.question_md} /><ApplicabilityLinks packageId={model.package_id} itemIds={item.question.applies_to} /></aside>;
  }
  return null;
}

interface ViewportSnapshot {
  scrollY: number;
  anchorId: string | null;
  anchorTop: number | null;
  openDetailIds: string[];
}

function captureViewport(route: Route): ViewportSnapshot {
  const anchor = route.itemId ? document.getElementById(`item-${route.itemId}`) : null;
  return {
    scrollY: window.scrollY,
    anchorId: anchor?.id ?? null,
    anchorTop: anchor?.getBoundingClientRect().top ?? null,
    openDetailIds: Array.from(document.querySelectorAll<HTMLDetailsElement>("details[data-item-id][open]"))
      .map((detail) => detail.dataset["itemId"])
      .filter((id): id is string => Boolean(id)),
  };
}

function restoreViewport(snapshot: ViewportSnapshot): void {
  window.requestAnimationFrame(() => {
    const anchor = snapshot.anchorId ? document.getElementById(snapshot.anchorId) : null;
    if (anchor && snapshot.anchorTop !== null) {
      window.scrollTo(0, Math.max(0, window.scrollY + anchor.getBoundingClientRect().top - snapshot.anchorTop));
    } else {
      window.scrollTo(0, snapshot.scrollY);
    }
    for (const detailId of snapshot.openDetailIds) {
      const detail = document.querySelector<HTMLDetailsElement>(`details[data-item-id="${CSS.escape(detailId)}"]`);
      if (detail) detail.open = true;
    }
  });
}

function selectionFromReference(reference: RuntimeViewReference): ViewSelection {
  return reference.kind === "snapshot" && reference.snapshot_id
    ? { kind: "snapshot", snapshotId: reference.snapshot_id }
    : { kind: "draft" };
}

function viewName(model: ViewerModel): string {
  if (model.view_kind === "snapshot") {
    return model.acceptance_status === "illustrative" ? "Illustrative accepted snapshot" : model.acceptance_status === "accepted" ? "Accepted snapshot" : "Pinned snapshot";
  }
  return "Working draft";
}

function ViewSwitcher({ model, state, route }: { model: ViewerModel; state: RuntimeState; route: Route }): ReactElement {
  const itemId = route.itemId && route.itemId !== "__invalid-route__" ? route.itemId : undefined;
  const acceptedViews = [...new Map(state.acceptances.map((record) => [record.snapshot_id, record])).values()];
  const defaultView = selectionFromReference(state.defaultView);
  if (acceptedViews.length === 0 && model.view_kind === "draft") return <></>;
  return (
    <nav aria-label="Proposal views" className="view-switcher">
      <p className="eyebrow">Proposal views</p>
      <ul>
        {state.currentCandidateId ? <li><a data-testid="view-draft" href={routeFor(model.package_id, itemId, { kind: "draft" })}>Working draft</a></li> : null}
        {acceptedViews.map((record) => {
          const selection: ViewSelection = { kind: "snapshot", snapshotId: record.snapshot_id };
          return (
            <li key={record.snapshot_id}>
              <a data-testid={`view-snapshot-${record.snapshot_id}`} href={routeFor(model.package_id, itemId, selection)}>
                {record.illustrative ? "Illustrative snapshot" : "Accepted snapshot"} · {record.record_id}
              </a>
            </li>
          );
        })}
      </ul>
      {model.view_kind === "snapshot" && model.snapshot_id && state.currentCandidateId
        ? <p><a data-testid="compare-with-draft" href={comparisonRouteFor(model.package_id, model.snapshot_id, { kind: "draft" })}>Compare with working draft</a></p>
        : null}
      {model.view_kind === "draft" && defaultView.kind === "snapshot"
        ? <p><a data-testid="view-default-snapshot" href={routeFor(model.package_id, itemId, defaultView)}>Open latest accepted snapshot</a></p>
        : null}
    </nav>
  );
}

function comparisonValue(value: unknown | null): ReactElement {
  if (value === null) return <span className="comparison-missing">Not present in this snapshot.</span>;
  if (typeof value === "string") return <span className="comparison-text">{value}</span>;
  return <pre className="comparison-json">{JSON.stringify(value, null, 2)}</pre>;
}

function comparisonAddress(change: ComparisonChange, plan: PlanPackage, older: boolean): string | undefined {
  const items = itemIndex(plan);
  const directlyAddressable = new Set(["constraint", "criterion", "decision", "phase", "question", "asset"]);
  if (older && directlyAddressable.has(change.category)) return change.id;
  return [change.id, ...change.affected_asset_ids, ...change.affected_item_ids].find((id) => items.has(id));
}

function ComparisonPanel({ comparison, model }: { comparison: ComparisonProjection; model: ViewerModel }): ReactElement {
  const toView = modelView(model);
  return (
    <section aria-labelledby="comparison-heading" className="comparison-panel" data-testid="comparison-summary">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Revision review</p>
          <h2 id="comparison-heading">Changes between saved proposals</h2>
        </div>
        <p>{comparison.material_change_count} material change{comparison.material_change_count === 1 ? "" : "s"}; {comparison.metadata_change_count} metadata change{comparison.metadata_change_count === 1 ? "" : "s"}.</p>
      </div>
      {comparison.unavailable_inputs.length > 0
        ? <aside className="comparison-warning" role="alert"><strong>Some captured inputs are unavailable.</strong><ul>{comparison.unavailable_inputs.map((input) => <li key={`${input.snapshot_id}-${input.file_id}`}>{input.message} <code>{input.snapshot_id}</code></li>)}</ul></aside>
        : null}
      {comparison.changes.length === 0
        ? <p data-testid="comparison-no-changes">The two snapshots contain the same reviewed content and captured files.</p>
        : <ol className="comparison-list">
          {comparison.changes.map((change) => {
            const olderAddress = comparisonAddress(change, model.package, true);
            const newerAddress = comparisonAddress(change, model.package, false);
            const fromHref = change.kind === "added" ? null : routeFor(model.package_id, olderAddress, { kind: "snapshot", snapshotId: change.old_snapshot_id });
            const toHref = change.kind === "removed" ? null : routeFor(model.package_id, newerAddress, toView);
            return (
              <li className={`comparison-change comparison-change--${change.classification}`} data-testid="comparison-change" key={`${change.category}-${change.id}`}>
                <div className="comparison-change__header">
                  <div><Chip tone={change.classification === "material" ? "info" : "neutral"}>{change.classification}</Chip> <strong>{change.category}</strong> <code>{change.id}</code></div>
                  <Chip tone={change.kind === "changed" ? "warning" : change.kind === "removed" ? "error" : "info"}>{change.kind}</Chip>
                </div>
                <p>Changed fields: {change.fields.map((field) => <code key={field}>{field}</code>)}</p>
                {change.affected_asset_ids.length > 0 ? <p>Related designs: {change.affected_asset_ids.map((assetId) => <code key={assetId}>{assetId}</code>)}</p> : null}
                <div className="comparison-values">
                  <div><h3>Older snapshot</h3>{comparisonValue(change.old_value)}{fromHref ? <p><a href={fromHref}>Open older item</a></p> : <p>Older item is not present.</p>}</div>
                  <div><h3>Newer snapshot</h3>{comparisonValue(change.new_value)}{toHref ? <p><a href={toHref}>Open newer item</a></p> : <p>Item was removed.</p>}</div>
                </div>
              </li>
            );
          })}
        </ol>}
      {comparison.diagnostics && comparison.diagnostics.length > 0 ? <DiagnosticPanel diagnostics={comparison.diagnostics} /> : null}
    </section>
  );
}

function ViewerHeader({ model, route, state, connection, transportError, onReload, loading }: {
  model: ViewerModel;
  route: Route;
  state: RuntimeState;
  connection: ConnectionStatus;
  transportError: string | null;
  onReload: () => void;
  loading: boolean;
}): ReactElement {
  const selected = route.itemId ? "linked item" : "overview";
  return (
    <header className="plan-header">
      <div>
        <p className="eyebrow">Local Plan Package</p>
        <h1>{model.package.title}</h1>
        <p className="header-meta"><Chip tone={model.acceptance_status === "accepted" ? "info" : "warning"}>{viewName(model)}</Chip> <span>Viewing {selected}</span></p>
        {model.acceptance_provenance ? <p className="acceptance-provenance" data-testid="acceptance-provenance">Recorded by <code>{model.acceptance_provenance.actor}</code> from <code>{model.acceptance_provenance.source}</code> on <time dateTime={model.acceptance_provenance.recorded_at}>{model.acceptance_provenance.recorded_at}</time>{model.acceptance_provenance.illustrative ? " · illustrative" : ""}.</p> : null}
      </div>
      <dl className="revision-summary">
        <div><dt>Package ID</dt><dd><code>{model.package_id}</code></dd></div>
        <div><dt>Author revision</dt><dd data-testid="current-revision">{model.revision}</dd></div>
        <div><dt>Content ID</dt><dd data-testid="content-id"><code>{model.content_id}</code></dd></div>
        <div><dt>Snapshot ID</dt><dd><code>{model.snapshot_id ?? "not persisted"}</code></dd></div>
        <div><dt>Readiness</dt><dd><Chip tone={model.readiness === "reviewable" ? "info" : "warning"}>{model.readiness}</Chip></dd></div>
      </dl>
      <div className="header-actions">
        <button disabled={loading} onClick={onReload} type="button">{loading ? "Reloading…" : "Reload package"}</button>
        <p>Declared package inputs refresh automatically; the last valid view remains during rejected edits.</p>
        <ViewSwitcher model={model} route={route} state={state} />
        <RuntimeStatus connection={connection} state={state} transportError={transportError} />
      </div>
    </header>
  );
}

function LoadedViewer({ model, state, connection, transportError, navigationNotice, loading, onReload, comparison }: {
  model: ViewerModel;
  state: RuntimeState;
  connection: ConnectionStatus;
  transportError: string | null;
  navigationNotice: string | null;
  loading: boolean;
  onReload: () => void;
  comparison: ComparisonProjection | null;
}): ReactElement {
  const [routeVersion, setRouteVersion] = useState(0);
  useEffect(() => {
    const onHashChange = (): void => setRouteVersion((version) => version + 1);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const route = useMemo(() => parseRoute(window.location.hash), [routeVersion]);
  const items = useMemo(() => itemIndex(model.package), [model.package]);
  const packageMismatch = route.packageId !== null && route.packageId !== model.package_id;
  const selected = !packageMismatch && route.itemId ? items.get(route.itemId) : undefined;
  const routeError = packageMismatch
    ? `This link names package '${route.packageId}', but the local runtime loaded '${model.package_id}'.`
    : route.itemId && !selected
      ? `No addressable item named '${route.itemId}' exists in package '${model.package_id}'.`
      : null;
  const selectedPhase = selected?.kind === "phase" ? selected.phase : selected?.kind === "criterion" ? selected.phase : undefined;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#viewer-main">Skip to package content</a>
      <ViewerHeader connection={connection} loading={loading} model={model} onReload={onReload} route={route} state={state} transportError={transportError} />
      <div className="viewer-layout">
        <aside className="viewer-sidebar">
          <a className={!route.itemId ? "overview-link overview-link--active" : "overview-link"} href={routeFor(model.package_id, undefined, modelView(model))}>Overview</a>
          <PhaseNavigator packageId={model.package_id} phases={model.package.phases} selectedPhaseId={selectedPhase?.id} />
        </aside>
        <main id="viewer-main" tabIndex={-1}>
          {routeError ? <aside className="route-error" data-testid="route-error" role="alert"><h2>Link target unavailable</h2><p>{routeError}</p><a href={routeFor(model.package_id, undefined, modelView(model))}>Return to package overview</a></aside> : null}
          {navigationNotice ? <aside className="navigation-notice" data-testid="navigation-notice" role="status"><h2>Navigation updated</h2><p>{navigationNotice}</p></aside> : null}
          {comparison ? <ComparisonPanel comparison={comparison} model={model} /> : null}
          <DiagnosticPanel diagnostics={[
            ...state.diagnostics,
            ...state.planningBlockers,
            ...state.acceptanceDiagnostics,
            ...model.diagnostics.filter((diagnostic) => !state.diagnostics.some((stateDiagnostic) => stateDiagnostic.code === diagnostic.code && stateDiagnostic.path === diagnostic.path)),
            ...model.planning_blockers.filter((diagnostic) => !state.planningBlockers.some((stateDiagnostic) => stateDiagnostic.code === diagnostic.code && stateDiagnostic.path === diagnostic.path)),
          ]} />
          {selectedPhase ? <PhaseDetail highlightedCriterionId={selected?.criterion?.id} model={model} phase={selectedPhase} /> : <Overview model={model} />}
          {selected && !selectedPhase ? <TargetDetail item={selected} model={model} /> : null}
        </main>
      </div>
    </div>
  );
}

function EmptyRuntime({ state, connection, transportError, onRetry }: {
  state: RuntimeState | null;
  connection: ConnectionStatus;
  transportError: string | null;
  onRetry: () => void;
}): ReactElement {
  return (
    <main className="runtime-empty">
      <h1>Package not ready to display</h1>
      <p>The runtime retained no valid candidate. Correct the declared package content, republish its manifest, then reload this page.</p>
      <RuntimeStatus connection={connection} state={state} transportError={transportError} />
      <DiagnosticPanel diagnostics={state?.diagnostics ?? []} />
      <button onClick={onRetry} type="button">Try again</button>
    </main>
  );
}

function ViewerApp(): ReactElement {
  const [model, setModel] = useState<ViewerModel | null>(null);
  const [state, setState] = useState<RuntimeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transportError, setTransportError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>("connecting");
  const [navigationNotice, setNavigationNotice] = useState<string | null>(null);
  const [comparison, setComparison] = useState<ComparisonProjection | null>(null);
  const modelRef = useRef<ViewerModel | null>(null);
  const requestSequence = useRef(0);

  const applyModel = useCallback((nextModel: ViewerModel): void => {
    const previousModel = modelRef.current;
    let viewport: ViewportSnapshot | null = null;
    const viewChanged = previousModel && (previousModel.content_id !== nextModel.content_id || previousModel.view_id !== nextModel.view_id);
    if (viewChanged) {
      const route = parseRoute(window.location.hash);
      viewport = captureViewport(route);
      const previousItems = previousModel ? itemIndex(previousModel.package) : new Map<string, AddressedItem>();
      const nextItems = itemIndex(nextModel.package);
      if (route.packageId === previousModel?.package_id && route.packageId !== nextModel.package_id) {
        window.history.replaceState(null, "", routeFor(nextModel.package_id, undefined, modelView(nextModel)));
        window.dispatchEvent(new Event("hashchange"));
        setNavigationNotice(`The package identity changed from '${previousModel?.package_id}' to '${nextModel.package_id}'; showing the new package overview.`);
        viewport.anchorId = null;
        viewport.anchorTop = null;
      } else if (route.packageId === previousModel?.package_id && route.itemId && !nextItems.has(route.itemId)) {
        const removed = previousItems.get(route.itemId);
        const fallbackId = removed?.phase && nextItems.has(removed.phase.id) ? removed.phase.id : undefined;
        window.history.replaceState(null, "", routeFor(nextModel.package_id, fallbackId, modelView(nextModel)));
        window.dispatchEvent(new Event("hashchange"));
        setNavigationNotice(removed
          ? `The selected ${removed.kind} '${removed.id}' was removed; showing ${fallbackId ? `surviving phase '${fallbackId}'` : "the package overview"}.`
          : `The selected item '${route.itemId}' was removed; showing ${fallbackId ? `surviving phase '${fallbackId}'` : "the package overview"}.`);
        viewport.anchorId = fallbackId ? `item-${fallbackId}` : null;
        viewport.anchorTop = fallbackId ? 0 : null;
      }
    }
    const route = parseRoute(window.location.hash);
    if (route.view.kind === "default" && nextModel.view_kind === "snapshot" && nextModel.snapshot_id && route.packageId === nextModel.package_id) {
      const canonical = routeFor(nextModel.package_id, route.itemId && route.itemId !== "__invalid-route__" ? route.itemId : undefined, modelView(nextModel));
      if (window.location.hash !== canonical.slice(1)) {
        window.history.replaceState(null, "", canonical);
        window.dispatchEvent(new Event("hashchange"));
        setNavigationNotice("The latest accepted proposal is now pinned to its concrete snapshot link.");
      }
    }
    modelRef.current = nextModel;
    setModel(nextModel);
    if (viewport) restoreViewport(viewport);
  }, []);

  const load = useCallback(async (revalidate = false) => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError(null);
    setTransportError(null);
    setComparison(null);
    try {
      const nextState = revalidate
        ? await fetchJson<RuntimeState>("/api/reload", { method: "POST" })
        : await fetchJson<RuntimeState>("/api/state");
      const route = parseRoute(window.location.hash);
      let nextModel: ViewerModel | null = null;
      const selectedView = route.view.kind === "snapshot"
        ? route.view
        : route.view.kind === "draft"
          ? route.view
          : selectionFromReference(nextState.defaultView);
      if (selectedView.kind === "snapshot") {
        nextModel = await fetchJson<ViewerModel>(`/api/snapshots/${encodeURIComponent(selectedView.snapshotId)}/model`);
      } else if (nextState.currentCandidateId) {
        nextModel = route.view.kind === "draft"
          ? await fetchJson<ViewerModel>("/api/draft/model")
          : await fetchJson<ViewerModel>(`/api/candidates/${encodeURIComponent(nextState.currentCandidateId)}/model`);
      }
      let nextComparison: ComparisonProjection | null = null;
      if (route.compare) {
        const to = route.compare.toView.kind === "draft" ? "draft" : route.compare.toView.kind === "snapshot" ? route.compare.toView.snapshotId : "draft";
        const comparisonResponse = await fetchJson<ComparisonResponse>(`/api/compare?from=${encodeURIComponent(route.compare.fromSnapshotId)}&to=${encodeURIComponent(to)}`);
        nextComparison = comparisonResponse.value ? { ...comparisonResponse.value, diagnostics: comparisonResponse.diagnostics } : null;
      }
      if (requestId !== requestSequence.current) return;
      setState(nextState);
      if (nextModel) {
        applyModel(nextModel);
        setComparison(nextComparison);
      } else {
        modelRef.current = null;
        setModel(null);
        setComparison(null);
      }
    } catch (reason) {
      if (requestId !== requestSequence.current) return;
      const message = reason instanceof Error ? reason.message : "The local runtime could not be reached.";
      const pinnedRoute = parseRoute(window.location.hash).view.kind !== "default" || Boolean(parseRoute(window.location.hash).compare);
      if (modelRef.current && !pinnedRoute) {
        setTransportError(message);
      } else {
        setError(message);
        setModel(null);
      }
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [applyModel]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onHashChange = (): void => void load();
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [load]);

  useEffect(() => {
    if (typeof EventSource === "undefined") {
      setConnection("offline");
      return;
    }
    const source = new EventSource("/api/events");
    const onOpen = (): void => {
      setConnection("connected");
      // A reconnect may have missed several named events. Fetch the complete
      // state, including diagnostics, before relying on future events.
      void load();
    };
    const onUpdate = (): void => void load();
    const onError = (): void => {
      setConnection(source.readyState === EventSource.CLOSED ? "offline" : "reconnecting");
    };
    source.addEventListener("open", onOpen);
    source.addEventListener("state", onUpdate);
    source.addEventListener("candidate-published", onUpdate);
    source.addEventListener("candidate-rejected", onUpdate);
    source.addEventListener("error", onError);
    return () => {
      source.removeEventListener("open", onOpen);
      source.removeEventListener("state", onUpdate);
      source.removeEventListener("candidate-published", onUpdate);
      source.removeEventListener("candidate-rejected", onUpdate);
      source.removeEventListener("error", onError);
      source.close();
    };
  }, [load]);

  const displayState = state ?? { packageId: null, currentCandidateId: null, currentSnapshotId: null, currentRevision: null, defaultView: { kind: "draft", snapshot_id: null, candidate_id: null }, diagnostics: [], planningBlockers: [], acceptances: [], acceptanceDiagnostics: [], lastAttempt: null } satisfies RuntimeState;
  if (error) {
    return (
      <main className="runtime-empty">
        <h1>Viewer connection problem</h1>
        <p role="alert">{error}</p>
        <RuntimeStatus connection={connection} state={state} transportError={transportError} />
        <button onClick={() => void load()} type="button">Try again</button>
      </main>
    );
  }
  if (loading && !model) {
    return <main className="runtime-empty" aria-busy="true"><h1>Loading package…</h1><RuntimeStatus connection={connection} state={state} transportError={transportError} /></main>;
  }
  if (!model) return <EmptyRuntime connection={connection} onRetry={() => void load()} state={state} transportError={transportError} />;
  return <LoadedViewer comparison={comparison} connection={connection} loading={loading} model={model} navigationNotice={navigationNotice} onReload={() => void load(true)} state={displayState} transportError={transportError} />;
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("Viewer root element is missing");
}

createRoot(root).render(
  <StrictMode>
    <ViewerApp />
  </StrictMode>,
);
