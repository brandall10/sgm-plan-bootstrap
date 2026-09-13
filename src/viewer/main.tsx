import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { ReactElement } from "react";

function BootstrapView(): ReactElement {
  return (
    <main>
      <h1>Plan Package Viewer</h1>
      <p>The package core and local runtime are ready. The review surface arrives in P2.</p>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("Viewer root element is missing");
}

createRoot(root).render(
  <StrictMode>
    <BootstrapView />
  </StrictMode>,
);
