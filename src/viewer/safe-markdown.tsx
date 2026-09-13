import type { ReactElement, ReactNode } from "react";

/**
 * A deliberately small renderer for the Markdown fields supported by the
 * package viewer. It emits React text nodes, never parses HTML, and only
 * turns explicitly safe protocols into links.
 */
export function safeHref(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith("#")) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:" ? trimmed : null;
  } catch {
    return null;
  }
}

function inlineNodes(source: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const token = /\[([^\]]+)]\(([^\s)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = token.exec(source))) {
    if (match.index > lastIndex) nodes.push(source.slice(lastIndex, match.index));
    const [raw, label, href, code, strong, emphasis] = match;
    if (label !== undefined && href !== undefined) {
      const safe = safeHref(href);
      nodes.push(safe
        ? <a href={safe} key={`link-${key}`} rel="noreferrer" target={safe.startsWith("#") ? undefined : "_blank"}>{label}</a>
        : <span key={`unsafe-link-${key}`}>{label}</span>);
    } else if (code !== undefined) {
      nodes.push(<code key={`code-${key}`}>{code}</code>);
    } else if (strong !== undefined) {
      nodes.push(<strong key={`strong-${key}`}>{strong}</strong>);
    } else if (emphasis !== undefined) {
      nodes.push(<em key={`emphasis-${key}`}>{emphasis}</em>);
    } else {
      nodes.push(raw);
    }
    key += 1;
    lastIndex = token.lastIndex;
  }
  if (lastIndex < source.length) nodes.push(source.slice(lastIndex));
  return nodes;
}

export function SafeMarkdown({ source }: { source: string }): ReactElement {
  const blocks = source.trim().split(/\n\s*\n/).filter(Boolean);
  return (
    <>
      {blocks.map((block, index) => {
        const lines = block.split("\n");
        const heading = /^(#{1,3})\s+(.+)$/.exec(block);
        if (heading) {
          const level = heading[1]?.length ?? 1;
          const content = inlineNodes(heading[2] ?? "");
          if (level === 1) return <h1 key={`block-${index}`}>{content}</h1>;
          if (level === 2) return <h2 key={`block-${index}`}>{content}</h2>;
          return <h3 key={`block-${index}`}>{content}</h3>;
        }
        if (lines.every((line) => line.startsWith("- "))) {
          return <ul key={`block-${index}`}>{lines.map((line, lineIndex) => <li key={`line-${lineIndex}`}>{inlineNodes(line.slice(2))}</li>)}</ul>;
        }
        return <p key={`block-${index}`}>{inlineNodes(lines.join(" "))}</p>;
      })}
    </>
  );
}
