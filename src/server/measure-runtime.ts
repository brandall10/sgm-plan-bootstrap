import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { arch, cpus, platform, release, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { chromium } from "@playwright/test";

import { loadCandidate } from "./candidate-loader.js";
import { CandidateStore } from "./candidate-store.js";
import { runPlanCli } from "./plan-cli.js";
import { startRuntime } from "./runtime.js";
import { publishPackage } from "./publication.js";
import { SnapshotStore } from "./snapshot-store.js";

const repositoryRoot = resolve(process.cwd());
const runCount = 5;

type Timing = { medianMs: number; minMs: number; maxMs: number; samplesMs: number[] };

function summarize(samples: number[]): Timing {
  const ordered = [...samples].sort((left, right) => left - right);
  const medianMs = ordered[Math.floor(ordered.length / 2)] ?? 0;
  return {
    medianMs: Number(medianMs.toFixed(2)),
    minMs: Number((ordered[0] ?? 0).toFixed(2)),
    maxMs: Number((ordered.at(-1) ?? 0).toFixed(2)),
    samplesMs: samples.map((sample) => Number(sample.toFixed(2))),
  };
}

function characterCount(value: string): number {
  return Array.from(value).length;
}

function fullFixtureContext(candidate: NonNullable<Awaited<ReturnType<typeof loadCandidate>>["candidate"]>): string {
  return JSON.stringify({
    manifest: candidate.plan,
    declared_files: [...candidate.files.values()].map(({ file, bytes }) => ({
      ...file,
      content: new TextDecoder().decode(bytes),
    })),
  });
}

async function waitForRevision(host: string, port: number, revision: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const state = await (await fetch(`http://${host}:${port}/api/state`)).json() as { currentRevision: number | null; lastAttempt: string };
    if (state.currentRevision === revision && state.lastAttempt === "published") return;
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error(`Runtime did not publish revision ${revision} within 5000ms.`);
}

async function copyFixture(): Promise<string> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plan-runtime-measure-"));
  const packageRoot = join(temporaryRoot, "offline-recovery");
  await cp(resolve(repositoryRoot, "examples/offline-recovery"), packageRoot, { recursive: true });
  return packageRoot;
}

async function measure(): Promise<void> {
  const packageRoot = resolve(repositoryRoot, "examples/offline-recovery");
  const baseline = await loadCandidate({ packageRoot, repositoryRoot });
  if (!baseline.candidate) throw new Error("Representative fixture did not load.");
  const fixtureBytes = [...baseline.candidate.files.values()].reduce((total, file) => total + file.bytes.byteLength, 0);

  const contextPackageRoot = await copyFixture();
  const contextStore = new CandidateStore();
  const contextCandidate = await contextStore.loadAndPublish({ packageRoot: contextPackageRoot, repositoryRoot });
  if (!contextCandidate?.snapshotId) throw new Error("Context measurement fixture did not publish a durable snapshot.");
  const contextSnapshotStore = new SnapshotStore({ root: join(contextPackageRoot, ".plan-package") });
  const accepted = await contextSnapshotStore.recordAcceptance({
    format: "plan-package-acceptance",
    format_version: "1",
    record_id: "acceptance.measurement",
    package_id: contextCandidate.packageId,
    snapshot_id: contextCandidate.snapshotId,
    instruction: "Accept the representative fixture for context measurement.",
    source: "measurement:context-comparison",
    actor: "tool:measure-runtime",
    recorded_at: "2026-09-15T16:00:00.000Z",
    illustrative: false,
  });
  if (!accepted.record) throw new Error("Context measurement fixture could not record its illustrative acceptance.");
  const fullContext = fullFixtureContext(contextCandidate);
  const fullContextSamples: number[] = [];
  for (let index = 0; index < runCount; index += 1) {
    const start = performance.now();
    fullFixtureContext(contextCandidate);
    fullContextSamples.push(performance.now() - start);
  }
  const selectedContextSamples: number[] = [];
  let selectedContext = "";
  for (let index = 0; index < runCount; index += 1) {
    const start = performance.now();
    const result = await runPlanCli({
      command: "context",
      packagePath: contextPackageRoot,
      snapshotId: contextCandidate.snapshotId,
      phaseId: "phase.persistence-outcomes",
      activity: "implement",
      refs: [],
      compareDraft: false,
    });
    if (result.exitCode !== 0) throw new Error("Selected context measurement did not produce a ready handoff.");
    selectedContext = result.output;
    selectedContextSamples.push(performance.now() - start);
  }
  const expansionSamples: number[] = [];
  let expandedContext = "";
  for (let index = 0; index < runCount; index += 1) {
    const start = performance.now();
    const result = await runPlanCli({
      command: "expand",
      packagePath: contextPackageRoot,
      snapshotId: contextCandidate.snapshotId,
      refs: ["reference.recovery-notes", "asset.recovery-flow"],
      compareDraft: false,
    });
    if (result.exitCode !== 0) throw new Error("Context expansion measurement failed.");
    expandedContext = result.output;
    expansionSamples.push(performance.now() - start);
  }

  const loadSamples: number[] = [];
  for (let index = 0; index < runCount; index += 1) {
    const start = performance.now();
    const result = await loadCandidate({ packageRoot, repositoryRoot });
    if (!result.candidate) throw new Error("Warm load did not produce a candidate.");
    loadSamples.push(performance.now() - start);
  }

  const openSamples: number[] = [];
  for (let index = 0; index < runCount; index += 1) {
    const start = performance.now();
    const runtime = await startRuntime({ packageRoot, port: 0, watch: false });
    const response = await fetch(`http://${runtime.host}:${runtime.port}/api/state`);
    if (!response.ok) throw new Error(`Runtime state returned ${response.status}.`);
    await runtime.close();
    openSamples.push(performance.now() - start);
  }

  const renderRuntime = await startRuntime({ packageRoot, port: 0, serveViewer: true, viewerRoot: repositoryRoot, watch: false });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const renderSamples: number[] = [];
  try {
    for (let index = 0; index < runCount; index += 1) {
      const page = await browser.newPage();
      const start = performance.now();
      await page.goto(`http://${renderRuntime.host}:${renderRuntime.port}/#/packages/offline-recovery`);
      await page.getByRole("heading", { name: "Make offline exercise recovery explicit", exact: true }).first().waitFor();
      renderSamples.push(performance.now() - start);
      await page.close();
    }
  } finally {
    await browser.close();
    await renderRuntime.close();
  }

  const refreshPackageRoot = await copyFixture();
  const refreshRuntime = await startRuntime({ packageRoot: refreshPackageRoot, port: 0, watchDebounceMs: 30 });
  const refreshManifestPath = join(refreshPackageRoot, "plan.json");
  const refreshManifest = JSON.parse(await readFile(refreshManifestPath, "utf8")) as { revision: number };
  const textSamples: number[] = [];
  const assetSamples: number[] = [];
  try {
    for (let index = 0; index < runCount; index += 1) {
      const revision = refreshManifest.revision + index + 1;
      const start = performance.now();
      await writeFile(join(refreshPackageRoot, "docs/behavior-notes.md"), `Measured text refresh ${index}.\n`);
      const published = await publishPackage({ packageRoot: refreshPackageRoot });
      if (!published.published) throw new Error("Text refresh publication failed.");
      await waitForRevision(refreshRuntime.host, refreshRuntime.port, revision);
      textSamples.push(performance.now() - start);
    }
    for (let index = 0; index < runCount; index += 1) {
      const revision = refreshManifest.revision + runCount + index + 1;
      const start = performance.now();
      await writeFile(join(refreshPackageRoot, "assets/recovery-flow.svg"), `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><text x="1" y="14">${index}</text></svg>\n`);
      const published = await publishPackage({ packageRoot: refreshPackageRoot });
      if (!published.published) throw new Error("Asset refresh publication failed.");
      await waitForRevision(refreshRuntime.host, refreshRuntime.port, revision);
      const state = await (await fetch(`http://${refreshRuntime.host}:${refreshRuntime.port}/api/state`)).json() as { currentCandidateId: string | null };
      if (!state.currentCandidateId) throw new Error("Asset refresh lost its current candidate.");
      const asset = await fetch(`http://${refreshRuntime.host}:${refreshRuntime.port}/api/candidates/${state.currentCandidateId}/assets/asset.recovery-flow`);
      if (!asset.ok) throw new Error(`Asset refresh returned ${asset.status}.`);
      await asset.arrayBuffer();
      assetSamples.push(performance.now() - start);
    }
  } finally {
    await refreshRuntime.close();
  }

  console.log(JSON.stringify({
    fixture: {
      name: "examples/offline-recovery",
      declaredFileCount: baseline.candidate.files.size,
      capturedBytes: fixtureBytes,
      packageRevision: baseline.candidate.revision,
    },
    environment: {
      node: process.version,
      platform: `${platform()} ${release()}`,
      arch: arch(),
      cpu: cpus()[0]?.model ?? "unknown",
      browser: "Google Chrome channel via Playwright",
    },
    method: "Five ordinary sequential warm runs per category; dependency installation and process startup are excluded from load/render/refresh samples. Runtime-open includes candidate load, watcher-disabled server startup, and one /api/state request. Render includes page navigation and the overview heading becoming visible. Text/asset refresh includes the file edit, atomic publication, watched candidate publication, and the corresponding state/asset request. Context comparison uses an illustrative accepted temporary copy of the representative fixture: full context is the JSON manifest plus all captured file text, selected context is the exact ready Markdown handoff for the persistence implementation phase, and expansion is an explicit notes/diagram request against the same snapshot.",
    runs: runCount,
    measurements: {
      warmCandidateLoadMs: summarize(loadSamples),
      runtimeOpenMs: summarize(openSamples),
      browserRenderMs: summarize(renderSamples),
      textRefreshMs: summarize(textSamples),
      assetRefreshMs: summarize(assetSamples),
      contextComparison: {
        snapshotId: contextCandidate.snapshotId,
        phaseId: "phase.persistence-outcomes",
        activity: "implement",
        full: {
          characters: characterCount(fullContext),
          elapsedMs: summarize(fullContextSamples),
        },
        selected: {
          characters: characterCount(selectedContext),
          elapsedMs: summarize(selectedContextSamples),
          expansionUses: 0,
        },
        expansion: {
          refs: ["reference.recovery-notes", "asset.recovery-flow"],
          characters: characterCount(expandedContext),
          elapsedMs: summarize(expansionSamples),
          expansionUses: runCount,
        },
        limitations: [
          "Character counts are not model token counts; no tokenizer was used.",
          "The full representation includes captured fixture file text while the selected handoff keeps those references expandable, so the comparison is an exploratory context-size measurement rather than a productivity claim.",
          "The five runs are local sequential measurements on one illustrative package and do not measure authoring, model, verification, or human-intervention time.",
        ],
      },
    },
  }, null, 2));
}

void measure();
