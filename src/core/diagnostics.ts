export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  code: string;
  message: string;
  path: string;
  severity: DiagnosticSeverity;
  itemId?: string;
}

export function isDiagnostic(value: unknown): value is Diagnostic {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate["code"] === "string"
    && typeof candidate["message"] === "string"
    && typeof candidate["path"] === "string"
    && (candidate["severity"] === "error" || candidate["severity"] === "warning" || candidate["severity"] === "info");
}

export function errorDiagnostic(
  code: string,
  message: string,
  path: string,
  itemId?: string,
): Diagnostic {
  return { code, message, path, severity: "error", ...(itemId ? { itemId } : {}) };
}

export function warningDiagnostic(
  code: string,
  message: string,
  path: string,
  itemId?: string,
): Diagnostic {
  return { code, message, path, severity: "warning", ...(itemId ? { itemId } : {}) };
}

export function infoDiagnostic(
  code: string,
  message: string,
  path: string,
  itemId?: string,
): Diagnostic {
  return { code, message, path, severity: "info", ...(itemId ? { itemId } : {}) };
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}
