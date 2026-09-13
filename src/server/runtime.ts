import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { createServer as createViteServer, type ViteDevServer } from "vite";

import type { Diagnostic } from "../core/diagnostics.js";
import type { CandidateLoadOptions } from "./candidate-loader.js";
import { CandidateStore, type RuntimeAssetResponse, type RuntimeChange, type RuntimeFileResponse } from "./candidate-store.js";
import { PackageWatcher } from "./package-watcher.js";

export interface RuntimeOptions extends CandidateLoadOptions {
  host?: string;
  port?: number;
  /** Mount the Vite review surface alongside this runtime's immutable API. */
  serveViewer?: boolean;
  /** Project root used by Vite when the review surface is enabled. */
  viewerRoot?: string;
  /** Watch package inputs and publish valid changes automatically (default true). */
  watch?: boolean;
  /** Debounce interval for filesystem events. */
  watchDebounceMs?: number;
}

export interface RunningRuntime {
  host: string;
  port: number;
  store: CandidateStore;
  server: Server;
  close(): Promise<void>;
}

function writeJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value, null, 2);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(body);
}

function pathPart(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return decoded && !decoded.includes("/") && !decoded.includes("\\") ? decoded : null;
  } catch {
    return null;
  }
}

function relativePrototypePath(parts: string[]): string | null {
  if (parts.length === 0) return "";
  const decoded = parts.map(pathPart);
  if (decoded.some((part) => !part || part === "." || part === "..")) return null;
  return decoded.join("/");
}

function requestUrl(request: IncomingMessage): URL {
  return new URL(request.url ?? "/", "http://127.0.0.1");
}

function notFound(response: ServerResponse, message: string, path: string): void {
  writeJson(response, 404, {
    diagnostics: [{ code: "not-found", message, path, severity: "error" satisfies Diagnostic["severity"] }],
  });
}

function writeResource(
  response: ServerResponse,
  resource: { bytes: Uint8Array; contentType: string },
  candidateId: string,
  contentSecurityPolicy: string,
  crossOriginResourcePolicy = "same-origin",
): void {
  response.writeHead(200, {
    "content-type": resource.contentType,
    "cache-control": "public, max-age=31536000, immutable",
    "content-security-policy": contentSecurityPolicy,
    "cross-origin-resource-policy": crossOriginResourcePolicy,
    "x-content-type-options": "nosniff",
    "x-plan-candidate": candidateId,
  });
  response.end(Buffer.from(resource.bytes));
}

const ASSET_CONTENT_SECURITY_POLICY = "default-src 'none'; base-uri 'none'; img-src 'self' data:; object-src 'none'; script-src 'none'; style-src 'self'";
function prototypeContentSecurityPolicy(origin: string): string {
  return `default-src 'none'; base-uri 'none'; connect-src 'none'; font-src ${origin}; form-action 'none'; frame-ancestors 'self'; img-src ${origin} data:; media-src 'none'; object-src 'none'; script-src ${origin}; style-src ${origin}; sandbox allow-scripts`;
}

function isRuntimeAssetResponse(resource: RuntimeAssetResponse | RuntimeFileResponse): resource is RuntimeAssetResponse {
  return "asset" in resource;
}

type EventClient = {
  response: ServerResponse;
  heartbeat: ReturnType<typeof setInterval>;
};

function writeEvent(response: ServerResponse, event: string, value: unknown): void {
  if (response.writableEnded || response.destroyed) return;
  response.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
}

function removeEventClient(client: EventClient, clients: Set<EventClient>): void {
  clearInterval(client.heartbeat);
  clients.delete(client);
}

function broadcastEvent(clients: Set<EventClient>, change: RuntimeChange): void {
  for (const client of clients) {
    if (client.response.writableEnded || client.response.destroyed) {
      removeEventClient(client, clients);
      continue;
    }
    try {
      writeEvent(client.response, change.kind, change.state);
    } catch {
      removeEventClient(client, clients);
    }
  }
}

function openEventStream(request: IncomingMessage, response: ServerResponse, store: CandidateStore, clients: Set<EventClient>): void {
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-store",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  response.flushHeaders();
  const client: EventClient = {
    response,
    heartbeat: setInterval(() => {
      if (response.writableEnded || response.destroyed) {
        removeEventClient(client, clients);
        return;
      }
      response.write(": keep-alive\n\n");
    }, 15_000),
  };
  clients.add(client);
  const close = (): void => removeEventClient(client, clients);
  request.once("close", close);
  response.once("close", close);
  response.write("retry: 1000\n\n");
  writeEvent(response, "state", store.getState());
}

/** Returns true only when the request was consumed by the runtime API. */
async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  store: CandidateStore,
  viewerOrigin: string,
  reloadOptions: CandidateLoadOptions,
  eventClients: Set<EventClient>,
): Promise<boolean> {
  const url = requestUrl(request);
  if (!url.pathname.startsWith("/api/")) return false;
  if (url.pathname === "/api/events") {
    if (request.method !== "GET") {
      writeJson(response, 405, { diagnostics: [{ code: "method-not-allowed", message: "Use GET to subscribe to package runtime events.", path: "$", severity: "error" satisfies Diagnostic["severity"] }] });
      return true;
    }
    openEventStream(request, response, store, eventClients);
    return true;
  }
  if (url.pathname === "/api/reload") {
    if (request.method !== "POST") {
      writeJson(response, 405, { diagnostics: [{ code: "method-not-allowed", message: "Use POST to revalidate the selected package.", path: "$", severity: "error" }] });
      return true;
    }
    await store.loadAndPublish(reloadOptions);
    writeJson(response, 200, store.getState());
    return true;
  }
  if (request.method !== "GET") {
    writeJson(response, 405, { diagnostics: [{ code: "method-not-allowed", message: "Only GET is supported by the local runtime.", path: "$", severity: "error" }] });
    return true;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.pathname === "/api/health") {
    writeJson(response, 200, { ok: true, state: store.getState() });
    return true;
  }
  if (url.pathname === "/api/state") {
    writeJson(response, 200, store.getState());
    return true;
  }
  if (parts.length === 4 && parts[0] === "api" && parts[1] === "candidates" && parts[3] === "model") {
    const candidateId = pathPart(parts[2] ?? "");
    if (!candidateId) {
      notFound(response, "Candidate ID is invalid.", url.pathname);
      return true;
    }
    const model = store.getModel(candidateId);
    if (!model) {
      notFound(response, `Candidate '${candidateId}' is no longer available.`, url.pathname);
      return true;
    }
    writeJson(response, 200, model);
    return true;
  }
  if (parts.length >= 5 && parts[0] === "api" && parts[1] === "candidates" && parts[3] === "prototypes") {
    const candidateId = pathPart(parts[2] ?? "");
    const assetId = pathPart(parts[4] ?? "");
    const prototypePath = relativePrototypePath(parts.slice(5));
    if (!candidateId || !assetId || prototypePath === null) {
      notFound(response, "Candidate, prototype, or declared dependency path is invalid.", url.pathname);
      return true;
    }
    const resource = store.getPrototypeFile(candidateId, assetId, prototypePath || undefined);
    if (!resource) {
      notFound(response, `Prototype '${assetId}' or its declared dependency is not available for candidate '${candidateId}'.`, url.pathname);
      return true;
    }
    // A sandboxed iframe has an opaque origin. Its declared dependencies must
    // therefore opt out of same-origin CORP while the candidate-scoped route,
    // CSP, and iframe sandbox continue to bound what can execute.
    writeResource(response, resource, candidateId, prototypeContentSecurityPolicy(viewerOrigin), "cross-origin");
    return true;
  }
  if (parts.length === 5 && parts[0] === "api" && parts[1] === "candidates") {
    const candidateId = pathPart(parts[2] ?? "");
    const resourceId = pathPart(parts[4] ?? "");
    if (!candidateId || !resourceId) {
      notFound(response, "Candidate or resource ID is invalid.", url.pathname);
      return true;
    }
    const resourceType = parts[3];
    const resource = resourceType === "assets"
      ? store.getAsset(candidateId, resourceId)
      : resourceType === "files"
        ? store.getFile(candidateId, resourceId)
        : null;
    if (!resource) {
      notFound(response, `Resource '${resourceId}' is not available for candidate '${candidateId}'.`, url.pathname);
      return true;
    }
    if (resourceType === "assets" && isRuntimeAssetResponse(resource) && resource.asset.format === "html") {
      notFound(response, `HTML prototype '${resourceId}' is available only through its isolated prototype route.`, url.pathname);
      return true;
    }
    writeResource(response, resource, candidateId, ASSET_CONTENT_SECURITY_POLICY);
    return true;
  }
  notFound(response, "Runtime route is not defined.", url.pathname);
  return true;
}

export async function startRuntime(options: RuntimeOptions): Promise<RunningRuntime> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4173;
  const store = new CandidateStore();
  await store.loadAndPublish(options);
  const eventClients = new Set<EventClient>();
  const unsubscribe = store.subscribe((change) => broadcastEvent(eventClients, change));
  let vite: ViteDevServer | undefined;
  let watcher: PackageWatcher | undefined;
  let viewerOrigin = `http://${host}`;
  const server = createServer((request, response) => {
    void (async () => {
      try {
        if (await handleRequest(request, response, store, viewerOrigin, options, eventClients)) return;
        const viewer = vite;
        if (viewer) {
          viewer.middlewares(request, response, (error?: Error) => {
            if (error) {
              viewer.ssrFixStacktrace(error);
              writeJson(response, 500, { diagnostics: [{ code: "viewer-error", message: error.message, path: request.url ?? "/", severity: "error" }] });
              return;
            }
            notFound(response, "Viewer route is not defined.", request.url ?? "/");
          });
          return;
        }
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        response.end("<!doctype html><title>Plan Package runtime</title><main><h1>Plan Package runtime</h1><p>The review surface is disabled for this runtime.</p></main>");
      } catch (error) {
        const message = error instanceof Error ? error.message : "The runtime could not reload the selected package.";
        writeJson(response, 500, { diagnostics: [{ code: "runtime-error", message, path: request.url ?? "/", severity: "error" }] });
      }
    })();
  });
  if (options.serveViewer) {
    vite = await createViteServer({
      root: options.viewerRoot ?? process.cwd(),
      appType: "spa",
      // Vite 7 otherwise opens an auxiliary WebSocket listener in middleware
      // mode. Attaching HMR to our loopback server keeps this a single process.
      server: { hmr: { server }, middlewareMode: true },
    });
  }
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  if (options.watch !== false) {
    watcher = new PackageWatcher({
      store,
      loadOptions: options,
      debounceMs: options.watchDebounceMs,
    });
    await watcher.start();
  }
  viewerOrigin = `http://${host}:${actualPort}`;
  return {
    host,
    port: actualPort,
    store,
    server,
    close: async () => {
      await watcher?.close();
      unsubscribe();
      for (const client of eventClients) {
        removeEventClient(client, eventClients);
        client.response.destroy();
      }
      // Vite owns the HMR upgrade attached to this server. Close it before
      // waiting for the HTTP server, otherwise an open browser tab can keep
      // server.close() pending indefinitely during test/runtime teardown.
      await vite?.close();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
