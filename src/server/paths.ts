import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { errorDiagnostic, warningDiagnostic, type Diagnostic } from "../core/diagnostics.js";
import type { PackageFile, PackageRootKind } from "../core/package.js";
import type { FileResolver, ResolvedFile } from "../core/resolve.js";

export interface RuntimeRoots {
  packageRoot: string;
  repositoryRoot?: string;
}

export interface DeclaredPath {
  root: PackageRootKind;
  declaredPath: string;
  absolutePath: string;
  realPath: string;
}

function rootFor(file: PackageFile, roots: RuntimeRoots): string | Diagnostic {
  if (file.root === "package") return roots.packageRoot;
  if (roots.repositoryRoot) return roots.repositoryRoot;
  return errorDiagnostic(
    "missing-declared-root",
    `File '${file.path}' selects the repository root, but no repository root was provided.`,
    `files.${file.id}.root`,
    file.id,
  );
}

function isWithinRoot(rootPath: string, filePath: string): boolean {
  const relativePath = relative(rootPath, filePath);
  return relativePath === "" || (relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath));
}

export async function resolveDeclaredPath(file: PackageFile, roots: RuntimeRoots): Promise<DeclaredPath | Diagnostic> {
  const selectedRoot = rootFor(file, roots);
  if (typeof selectedRoot !== "string") return selectedRoot;

  let realRoot: string;
  try {
    realRoot = await realpath(selectedRoot);
  } catch {
    return errorDiagnostic(
      "missing-declared-root",
      `Declared ${file.root} root '${selectedRoot}' does not exist.`,
      `files.${file.id}.root`,
      file.id,
    );
  }

  const absolutePath = resolve(realRoot, file.path);
  if (!isWithinRoot(realRoot, absolutePath)) {
    return errorDiagnostic(
      "path-confinement",
      `Declared path '${file.path}' resolves outside the ${file.root} root.`,
      `files.${file.id}.path`,
      file.id,
    );
  }

  let realPath: string;
  try {
    realPath = await realpath(absolutePath);
  } catch {
    const diagnostic = file.required
      ? errorDiagnostic("missing-file", `Declared file '${file.path}' is unavailable.`, `files.${file.id}.path`, file.id)
      : warningDiagnostic("missing-optional-file", `Optional file '${file.path}' is unavailable.`, `files.${file.id}.path`, file.id);
    return diagnostic;
  }
  if (!isWithinRoot(realRoot, realPath)) {
    return errorDiagnostic(
      "path-confinement",
      `Declared path '${file.path}' follows a symlink outside the ${file.root} root.`,
      `files.${file.id}.path`,
      file.id,
    );
  }

  return { root: file.root, declaredPath: file.path, absolutePath, realPath };
}

export function fileResolver(roots: RuntimeRoots): FileResolver {
  return {
    async resolve(file): Promise<ResolvedFile | Diagnostic> {
      const declaredPath = await resolveDeclaredPath(file, roots);
      if ("code" in declaredPath) return declaredPath;
      try {
        const bytes = await readFile(declaredPath.realPath);
        return { file, bytes: new Uint8Array(bytes) };
      } catch {
        return file.required
          ? errorDiagnostic("file-read-failed", `Declared file '${file.path}' could not be read.`, `files.${file.id}.path`, file.id)
          : warningDiagnostic("optional-file-read-failed", `Optional file '${file.path}' could not be read.`, `files.${file.id}.path`, file.id);
      }
    },
  };
}

export function contentTypeForPath(path: string, declaredType?: string): string {
  if (declaredType) return declaredType;
  const extension = path.toLowerCase().split(".").pop();
  switch (extension) {
    case "css": return "text/css; charset=utf-8";
    case "html": return "text/html; charset=utf-8";
    case "js": return "text/javascript; charset=utf-8";
    case "json": return "application/json; charset=utf-8";
    case "md": return "text/markdown; charset=utf-8";
    case "svg": return "image/svg+xml";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "webp": return "image/webp";
    default: return "application/octet-stream";
  }
}
