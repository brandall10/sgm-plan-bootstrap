import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import type { Diagnostic } from "../core/diagnostics.js";
import type { CandidateLoadOptions } from "./candidate-loader.js";
import { CandidateStore } from "./candidate-store.js";

export interface RuntimeOptions extends CandidateLoadOptions {
  host?: string;
  port?: number;
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

function requestUrl(request: IncomingMessage): URL {
  return new URL(request.url ?? "/", "http://127.0.0.1");
}

function notFound(response: ServerResponse, message: string, path: string): void {
  writeJson(response, 404, {
    diagnostics: [{ code: "not-found", message, path, severity: "error" satisfies Diagnostic["severity"] }],
  });
}

function handleRequest(request: IncomingMessage, response: ServerResponse, store: CandidateStore): void {
  if (request.method !== "GET") {
    writeJson(response, 405, { diagnostics: [{ code: "method-not-allowed", message: "Only GET is supported by the P1 runtime.", path: "$", severity: "error" }] });
    return;
  }
  const url = requestUrl(request);
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.pathname === "/" || url.pathname === "/index.html") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end("<!doctype html><title>Plan Package runtime</title><main><h1>Plan Package runtime</h1><p>The reusable review surface is scheduled for P2.</p></main>");
    return;
  }
  if (url.pathname === "/api/health") {
    writeJson(response, 200, { ok: true, state: store.getState() });
    return;
  }
  if (url.pathname === "/api/state") {
    writeJson(response, 200, store.getState());
    return;
  }
  if (parts.length === 4 && parts[0] === "api" && parts[1] === "candidates" && parts[3] === "model") {
    const candidateId = pathPart(parts[2] ?? "");
    if (!candidateId) return notFound(response, "Candidate ID is invalid.", url.pathname);
    const model = store.getModel(candidateId);
    if (!model) return notFound(response, `Candidate '${candidateId}' is no longer available.`, url.pathname);
    writeJson(response, 200, model);
    return;
  }
  if (parts.length === 5 && parts[0] === "api" && parts[1] === "candidates") {
    const candidateId = pathPart(parts[2] ?? "");
    const resourceId = pathPart(parts[4] ?? "");
    if (!candidateId || !resourceId) return notFound(response, "Candidate or resource ID is invalid.", url.pathname);
    const resourceType = parts[3];
    const resource = resourceType === "assets"
      ? store.getAsset(candidateId, resourceId)
      : resourceType === "files"
        ? store.getFile(candidateId, resourceId)
        : null;
    if (!resource) return notFound(response, `Resource '${resourceId}' is not available for candidate '${candidateId}'.`, url.pathname);
    response.writeHead(200, {
      "content-type": resource.contentType,
      "cache-control": "public, max-age=31536000, immutable",
      "content-security-policy": "default-src 'none'; img-src 'self' data:; style-src 'self'; script-src 'self';",
      "x-plan-candidate": candidateId,
    });
    response.end(Buffer.from(resource.bytes));
    return;
  }
  notFound(response, "Runtime route is not defined.", url.pathname);
}

export async function startRuntime(options: RuntimeOptions): Promise<RunningRuntime> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4173;
  const store = new CandidateStore();
  await store.loadAndPublish(options);
  const server = createServer((request, response) => handleRequest(request, response, store));
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
  return {
    host,
    port: actualPort,
    store,
    server,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}
