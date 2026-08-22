'use client';

import { Fragment, memo, useMemo, type ReactNode } from 'react';
import { parseBlocks, type Align, type Block, type Inline } from '@/lib/markdown';
import { cn } from '@/lib/utils';

/**
 * The model's own formatting, drawn instead of spelled out.
 *
 * Claude writes markdown by habit — a bold phrase where it wants the stress, a
 * list when it is naming three things — and the journal used to print the
 * syntax: literal asterisks around a title, hyphens down the left of a reply.
 * That is the app admitting it did not read what it was sent.
 *
 * Everything here is sized for a conversation rather than for a document. A
 * heading in a chat bubble is a bold line, not a banner; the type stays at the
 * body size the bubble was already set in, so a formatted reply and a plain one
 * sit in the same column and read as the same voice. What the formatting buys
 * is structure — which words are stressed, which lines are a list — and none of
 * it should cost the reply its place in the conversation.
 *
 * Every frame of a streamed reply comes through here, so the parse is memoised
 * on the text and the whole component on its props: a token arriving re-parses
 * one bubble, not the thread.
 */
export const Markdown = memo(function Markdown({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return <div className={cn('space-y-2.5', className)}>{renderBlocks(blocks)}</div>;
});

function renderBlocks(blocks: Block[]): ReactNode {
  return blocks.map((block, i) => <BlockView key={i} block={block} />);
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'paragraph':
      // Pre-wrap because a line break the model typed is a line break it meant.
      // Markdown would fold it into a space; a reply that lists three things on
      // three lines without bothering with hyphens is commoner than either.
      return <p className="whitespace-pre-wrap">{renderInline(block.content)}</p>;

    case 'heading': {
      // Never an h1: this sits inside a page that already has its own heading,
      // and a reply is not allowed to outrank it in the document outline.
      const Tag = `h${Math.min(6, block.level + 2)}` as 'h3';
      return (
        <Tag className={cn('font-display font-extrabold', block.level <= 2 && 'text-[1.0625rem]')}>
          {renderInline(block.content)}
        </Tag>
      );
    }

    case 'list':
      return block.ordered ? (
        <ol
          start={block.start}
          className="marker:text-muted-foreground list-decimal space-y-1 pl-5 marker:font-bold"
        >
          {block.items.map((item, i) => (
            <li key={i}>
              <ItemBody blocks={item} />
            </li>
          ))}
        </ol>
      ) : (
        <ul className="marker:text-muted-foreground list-disc space-y-1 pl-5">
          {block.items.map((item, i) => (
            <li key={i}>
              <ItemBody blocks={item} />
            </li>
          ))}
        </ul>
      );

    case 'quote':
      return (
        <blockquote className="border-border text-muted-foreground space-y-2 border-l-2 pl-3">
          {renderBlocks(block.children)}
        </blockquote>
      );

    case 'code':
      return (
        <pre className="bg-muted border-border overflow-x-auto rounded-[var(--radius)] border-2 p-3">
          <code className="text-footnote font-mono">{block.text}</code>
        </pre>
      );

    case 'table':
      return <TableView block={block} />;

    case 'rule':
      return <hr className="border-border border-t-2" />;
  }
}

/**
 * A list item's contents, unwrapped when there is only the one paragraph.
 *
 * Which is nearly always — and a <p> inside every <li> would put block spacing
 * between the bullet and its own words.
 */
function ItemBody({ blocks }: { blocks: Block[] }) {
  const only = blocks.length === 1 ? blocks[0] : undefined;
  if (only?.kind === 'paragraph') return <>{renderInline(only.content)}</>;
  return <div className="space-y-2">{renderBlocks(blocks)}</div>;
}

/**
 * A table, kept inside its own scroller.
 *
 * Rare in a reply and rarer still that it is the right shape for a phone — the
 * cards are what data is meant to arrive as. But a model that has decided on a
 * table will send one, and pipes and dashes down the bubble are worse than a
 * small table that scrolls sideways on its own without dragging the page with
 * it. Cells are laid out against the header, so a short row still lines up.
 */
function TableView({ block }: { block: Extract<Block, { kind: 'table' }> }) {
  return (
    <div className="border-border overflow-x-auto rounded-[var(--radius)] border-2">
      <table className="text-footnote w-full border-collapse">
        <thead>
          <tr className="border-border bg-muted border-b-2">
            {block.head.map((cell, i) => (
              <th key={i} className={cn('px-2.5 py-1.5 font-extrabold', column(block.align[i]))}>
                {renderInline(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, r) => (
            <tr key={r} className="border-border/60 border-b last:border-0">
              {block.head.map((_, c) => (
                <td key={c} className={cn('tnum px-2.5 py-1.5 font-medium', column(block.align[c]))}>
                  {renderInline(row[c] ?? [])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function column(align: Align | undefined): string {
  return align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
}

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((node, i) => {
    switch (node.kind) {
      case 'text':
        return <Fragment key={i}>{node.text}</Fragment>;
      case 'strong':
        // The app runs a step heavier than regular everywhere, so bold has to
        // go to 800 to read as bold rather than as a slightly darker sentence.
        return (
          <strong key={i} className="font-extrabold">
            {renderInline(node.children)}
          </strong>
        );
      case 'em':
        return (
          <em key={i} className="italic">
            {renderInline(node.children)}
          </em>
        );
      case 'strike':
        return (
          <s key={i} className="text-muted-foreground">
            {renderInline(node.children)}
          </s>
        );
      case 'code':
        return (
          <code
            key={i}
            className="bg-muted border-border rounded-md border px-1 py-0.5 font-mono text-[0.875em]"
          >
            {node.text}
          </code>
        );
      case 'link':
        return (
          <a
            key={i}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[var(--calories-deep)] underline underline-offset-2"
          >
            {renderInline(node.children)}
          </a>
        );
    }
  });
}
