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
import type { AcceptanceRecord } from "../core/snapshot.js";
import { SafeMarkdown } from "./safe-markdown.js";

import "./styles.css";

interface ViewerModel {
  package: PlanPackage;
  package_id: string;
  revision: number;
  content_id: string;
  readiness: "reviewable" | "reviewable-with-planning-blockers";
  acceptance_status: "unverified" | "accepted" | "illustrative";
  diagnostics: Diagnostic[];
  planning_blockers: Diagnostic[];
  files: PackageFile[];
  snapshot_id: string | null;
  acceptances: AcceptanceRecord[];
}

interface RuntimeState {
  packageId: string | null;
  currentCandidateId: string | null;
  currentSnapshotId: string | null;
  currentRevision: number | null;
  diagnostics: Diagnostic[];
  planningBlockers: Diagnostic[];
  acceptances: AcceptanceRecord[];
  acceptanceDiagnostics: Diagnostic[];
  lastAttempt: "published" | "rejected" | null;
}

type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "offline";

interface Route {
  packageId: string | null;
  itemId: string | null;
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
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] !== "packages") return { packageId: null, itemId: null };
  const packageId = decodeRoutePart(parts[1]);
  if (parts.length === 2) return { packageId, itemId: null };
  if (parts[2] === "items" && parts.length === 4) return { packageId, itemId: decodeRoutePart(parts[3]) };
  return { packageId, itemId: "__invalid-route__" };
}

function routeFor(packageId: string, itemId?: string): string {
  const packageRoute = `#/packages/${encodeURIComponent(packageId)}`;
  return itemId ? `${packageRoute}/items/${encodeURIComponent(itemId)}` : packageRoute;
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
  return <a href={routeFor(packageId, itemId)}>{children}</a>;
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

function assetUrl(candidateId: string, assetId: string): string {
  return `/api/candidates/${encodeURIComponent(candidateId)}/assets/${encodeURIComponent(assetId)}`;
}

function prototypeUrl(candidateId: string, assetId: string): string {
  return `/api/candidates/${encodeURIComponent(candidateId)}/prototypes/${encodeURIComponent(assetId)}/`;
}

function ArtifactFrame({ candidateId, files, packageId, revision, asset }: {
  candidateId: string;
  files: PackageFile[];
  packageId: string;
  revision: number;
  asset: PackageAsset;
}): ReactElement {
  const file = files.find((candidate) => candidate.id === asset.file_id);
  return (
    <article className="artifact-frame" id={`item-${asset.id}`}>
      <div className="artifact-frame__header">
        <div>
          <p className="eyebrow">Selected artifact</p>
          <h3><ItemLink packageId={packageId} itemId={asset.id}>{asset.id}</ItemLink></h3>
        </div>
        <div className="artifact-labels">
          <Chip tone={asset.authority === "authoritative" ? "info" : "neutral"}>{asset.authority}</Chip>
          {asset.mock ? <Chip tone="warning">Mock behavior</Chip> : <Chip>Design artifact</Chip>}
        </div>
      </div>
      <SafeMarkdown source={asset.purpose_md} />
      <dl className="artifact-metadata">
        <div><dt>Package revision</dt><dd>{revision}</dd></div>
        <div><dt>Source file</dt><dd><code>{file?.path ?? asset.file_id}</code></dd></div>
        <div><dt>Format</dt><dd>{asset.format}</dd></div>
      </dl>
      {asset.format === "svg"
        ? <figure><img alt={`Diagram: ${asset.purpose_md}`} src={assetUrl(candidateId, asset.id)} /><figcaption>Generated from the immutable candidate <code>{candidateId}</code>.</figcaption></figure>
        : asset.format === "html"
          ? <figure className="prototype-figure"><iframe data-testid={`prototype-${asset.id}`} referrerPolicy="no-referrer" sandbox="allow-scripts" src={prototypeUrl(candidateId, asset.id)} title={`Isolated mock prototype: ${asset.id}`} /><figcaption>The prototype is a sandboxed, candidate-scoped mock. It cannot access viewer controls or claim to operate the underlying product.</figcaption></figure>
          : <p className="artifact-unavailable" role="status">This viewer can describe the declared <code>{asset.format}</code> artifact, but cannot safely render it inline.</p>}
      <p className="applies-label">Governs or explains</p>
      <ApplicabilityLinks packageId={packageId} itemIds={asset.applies_to} />
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
      {assets.map((asset) => <ArtifactFrame asset={asset} candidateId={model.content_id} files={model.files} key={asset.id} packageId={model.package_id} revision={model.revision} />)}
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
      <DecisionQuestionPanel packageId={model.package_id} plan={plan} />
      <ArtifactList model={model} />
    </>
  );
}

function TargetDetail({ item, model }: { item: AddressedItem; model: ViewerModel }): ReactElement | null {
  if (item.kind === "phase" || item.kind === "criterion") return null;
  if (item.kind === "asset" && item.asset) {
    return <section aria-label="Linked artifact" className="target-detail"><ArtifactFrame asset={item.asset} candidateId={model.content_id} files={model.files} packageId={model.package_id} revision={model.revision} /></section>;
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
        <p className="header-meta"><Chip tone={model.acceptance_status === "accepted" ? "info" : "warning"}>{model.acceptance_status === "accepted" ? "Accepted snapshot" : model.acceptance_status === "illustrative" ? "Illustrative acceptance" : "Working proposal · acceptance unverified"}</Chip> <span>Viewing {selected}</span></p>
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
        <RuntimeStatus connection={connection} state={state} transportError={transportError} />
      </div>
    </header>
  );
}

function LoadedViewer({ model, state, connection, transportError, navigationNotice, loading, onReload }: {
  model: ViewerModel;
  state: RuntimeState;
  connection: ConnectionStatus;
  transportError: string | null;
  navigationNotice: string | null;
  loading: boolean;
  onReload: () => void;
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
          <a className={!route.itemId ? "overview-link overview-link--active" : "overview-link"} href={routeFor(model.package_id)}>Overview</a>
          <PhaseNavigator packageId={model.package_id} phases={model.package.phases} selectedPhaseId={selectedPhase?.id} />
        </aside>
        <main id="viewer-main" tabIndex={-1}>
          {routeError ? <aside className="route-error" data-testid="route-error" role="alert"><h2>Link target unavailable</h2><p>{routeError}</p><a href={routeFor(model.package_id)}>Return to package overview</a></aside> : null}
          {navigationNotice ? <aside className="navigation-notice" data-testid="navigation-notice" role="status"><h2>Navigation updated</h2><p>{navigationNotice}</p></aside> : null}
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
  const modelRef = useRef<ViewerModel | null>(null);
  const requestSequence = useRef(0);

  const applyModel = useCallback((nextModel: ViewerModel): void => {
    const previousModel = modelRef.current;
    let viewport: ViewportSnapshot | null = null;
    if (previousModel && previousModel.content_id !== nextModel.content_id) {
      const route = parseRoute(window.location.hash);
      viewport = captureViewport(route);
      const previousItems = itemIndex(previousModel.package);
      const nextItems = itemIndex(nextModel.package);
      if (route.packageId === previousModel.package_id && route.packageId !== nextModel.package_id) {
        window.history.replaceState(null, "", routeFor(nextModel.package_id));
        window.dispatchEvent(new Event("hashchange"));
        setNavigationNotice(`The package identity changed from '${previousModel.package_id}' to '${nextModel.package_id}'; showing the new package overview.`);
        viewport.anchorId = null;
        viewport.anchorTop = null;
      } else if (route.packageId === previousModel.package_id && route.itemId && !nextItems.has(route.itemId)) {
        const removed = previousItems.get(route.itemId);
        const fallbackId = removed?.phase && nextItems.has(removed.phase.id) ? removed.phase.id : undefined;
        window.history.replaceState(null, "", routeFor(nextModel.package_id, fallbackId));
        window.dispatchEvent(new Event("hashchange"));
        setNavigationNotice(removed
          ? `The selected ${removed.kind} '${removed.id}' was removed; showing ${fallbackId ? `surviving phase '${fallbackId}'` : "the package overview"}.`
          : `The selected item '${route.itemId}' was removed; showing ${fallbackId ? `surviving phase '${fallbackId}'` : "the package overview"}.`);
        viewport.anchorId = fallbackId ? `item-${fallbackId}` : null;
        viewport.anchorTop = fallbackId ? 0 : null;
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
    try {
      const nextState = revalidate
        ? await fetchJson<RuntimeState>("/api/reload", { method: "POST" })
        : await fetchJson<RuntimeState>("/api/state");
      let nextModel: ViewerModel | null = null;
      if (nextState.currentCandidateId) {
        nextModel = await fetchJson<ViewerModel>(`/api/candidates/${encodeURIComponent(nextState.currentCandidateId)}/model`);
      }
      if (requestId !== requestSequence.current) return;
      setState(nextState);
      if (nextModel) {
        applyModel(nextModel);
      } else {
        modelRef.current = null;
        setModel(null);
      }
    } catch (reason) {
      if (requestId !== requestSequence.current) return;
      const message = reason instanceof Error ? reason.message : "The local runtime could not be reached.";
      if (modelRef.current) {
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

  const displayState = state ?? { packageId: null, currentCandidateId: null, currentSnapshotId: null, currentRevision: null, diagnostics: [], planningBlockers: [], acceptances: [], acceptanceDiagnostics: [], lastAttempt: null } satisfies RuntimeState;
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
  return <LoadedViewer connection={connection} loading={loading} model={model} navigationNotice={navigationNotice} onReload={() => void load(true)} state={displayState} transportError={transportError} />;
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
