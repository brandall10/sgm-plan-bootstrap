import type { ResolvedFile } from "./resolve.js";

/**
 * The displayed ID is deliberately different from the author revision. It
 * binds the exact manifest bytes to the verified file inventory, including
 * files that are only transitive prototype dependencies.
 */
export function contentIdInput(manifestBytes: Uint8Array, files: Iterable<ResolvedFile>): Uint8Array {
  const encoder = new TextEncoder();
  const orderedFiles = [...files].sort((left, right) => left.file.id.localeCompare(right.file.id));
  const fileLines = orderedFiles.map(({ file }) => `${file.id}\u0000${file.root}\u0000${file.path}\u0000${file.sha256}`);
  return encoder.encode(`${bytesToHex(manifestBytes)}\n${fileLines.join("\n")}`);
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
