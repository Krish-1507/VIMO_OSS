import { type ReactNode } from 'react';

/**
 * MarkdownLite — tiny dependency-free renderer for assistant output.
 *
 * Supports what LLMs actually emit in chat: headings, **bold**, *italic*,
 * `inline code`, fenced code blocks, bullet/ordered lists, links, and
 * paragraphs. Deliberately NOT a full markdown engine — no tables, no HTML
 * passthrough (which also keeps the panel XSS-safe by construction).
 */

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Order matters: bold before italic, code and links tokenized first.
  const pattern = /(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(`[^`]+`)|(\[[^\]]+\]\([^)\s]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={key} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('*')) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`')) {
      nodes.push(
        <code key={key} className="rounded bg-slate-800 px-1 py-0.5 font-mono text-[0.8em] text-teal-300">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      const linkMatch = token.match(/\[([^\]]+)\]\(([^)\s]+)\)/);
      if (linkMatch) {
        nodes.push(
          <a
            key={key}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer noopener"
            className="text-teal-400 underline decoration-teal-400/40 hover:decoration-teal-300"
          >
            {linkMatch[1]}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

type Block =
  | { kind: 'code'; lang: string; content: string }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'p'; text: string };

function parseBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  // Split out fenced code blocks first.
  const fenceRe = /```(\w*)\n?([\s\S]*?)(?:```|$)/g;
  let cursor = 0;
  let m: RegExpExecArray | null;

  const pushText = (raw: string) => {
    const lines = raw.split('\n');
    let para: string[] = [];
    let list: { kind: 'ul' | 'ol'; items: string[] } | null = null;

    const flushPara = () => {
      if (para.length) {
        blocks.push({ kind: 'p', text: para.join(' ') });
        para = [];
      }
    };
    const flushList = () => {
      if (list) {
        blocks.push(list.kind === 'ul' ? { kind: 'ul', items: list.items } : { kind: 'ol', items: list.items });
        list = null;
      }
    };

    for (const line of lines) {
      const trimmed = line.trim();
      const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
      const ul = trimmed.match(/^[-*•]\s+(.*)$/);
      const ol = trimmed.match(/^\d+[.)]\s+(.*)$/);

      if (!trimmed) {
        flushPara();
        flushList();
      } else if (heading) {
        flushPara();
        flushList();
        blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] });
      } else if (ul) {
        flushPara();
        if (!list || list.kind !== 'ul') {
          flushList();
          list = { kind: 'ul', items: [] };
        }
        list.items.push(ul[1]);
      } else if (ol) {
        flushPara();
        if (!list || list.kind !== 'ol') {
          flushList();
          list = { kind: 'ol', items: [] };
        }
        list.items.push(ol[1]);
      } else {
        flushList();
        para.push(trimmed);
      }
    }
    flushPara();
    flushList();
  };

  while ((m = fenceRe.exec(src)) !== null) {
    if (m.index > cursor) pushText(src.slice(cursor, m.index));
    blocks.push({ kind: 'code', lang: m[1] || '', content: m[2].replace(/\n$/, '') });
    cursor = fenceRe.lastIndex;
  }
  if (cursor < src.length) pushText(src.slice(cursor));

  return blocks;
}

export default function MarkdownLite({ text }: { text: string }) {
  const blocks = parseBlocks(text || '');
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {blocks.map((b, bi) => {
        switch (b.kind) {
          case 'code':
            return (
              <pre
                key={bi}
                className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200"
              >
                {b.lang && <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">{b.lang}</div>}
                <code>{b.content}</code>
              </pre>
            );
          case 'heading': {
            const size =
              b.level <= 2 ? 'text-base font-semibold' : 'text-sm font-semibold';
            return (
              <div key={bi} className={`${size} text-white`}>
                {renderInline(b.text, `h${bi}`)}
              </div>
            );
          }
          case 'ul':
            return (
              <ul key={bi} className="ml-4 list-disc space-y-1">
                {b.items.map((it, ii) => (
                  <li key={ii}>{renderInline(it, `u${bi}-${ii}`)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={bi} className="ml-4 list-decimal space-y-1">
                {b.items.map((it, ii) => (
                  <li key={ii}>{renderInline(it, `o${bi}-${ii}`)}</li>
                ))}
              </ol>
            );
          default:
            return <p key={bi}>{renderInline(b.text, `p${bi}`)}</p>;
        }
      })}
    </div>
  );
}
