import { Fragment, type ReactNode } from 'react';
import { parseBlocks, type Block, type Inline } from '@ct/shared/markdown';

/**
 * A blog post's markdown, set as a document.
 *
 * `components/Markdown.tsx` already renders the same block tree and is not
 * reusable here, deliberately: it is sized for a chat bubble, where "a heading
 * is a bold line, not a banner" and everything stays at body size so a
 * formatted reply and a plain one read as the same voice. An article wants the
 * opposite — real heading hierarchy, measure-limited paragraphs, space that
 * tells a reader where the sections are.
 *
 * Same parser, different typography. Sharing `parseBlocks` is what matters:
 * there is exactly one definition of what the markdown means, and two opinions
 * about how it should look.
 *
 * A server component with no interactivity, so the whole article is in the
 * HTML — which is the entire reason the blog exists.
 */
export function ArticleBody({ markdown }: { markdown: string }) {
  return <div className="space-y-5">{parseBlocks(markdown).map(renderBlock)}</div>;
}

function renderBlock(block: Block, i: number): ReactNode {
  return <BlockView key={i} block={block} />;
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'paragraph':
      return <p className="text-body leading-relaxed">{inline(block.content)}</p>;

    case 'heading': {
      /*
       * Shifted down one. The page's own <h1> is the title, and a post whose
       * body opens at "#" would give the document two of them — the writer is
       * told to start at "##", and this makes that safe rather than trusting
       * it.
       */
      const level = Math.min(block.level + 1, 6);
      const Tag = `h${level}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      const size =
        level <= 2
          ? 'text-section-title mt-10'
          : level === 3
            ? 'mt-8 text-[19px] font-extrabold tracking-[-0.01em]'
            : 'mt-6 text-[17px] font-bold';
      return (
        <Tag className={`font-[family-name:var(--font-display)] text-balance ${size}`}>
          {inline(block.content)}
        </Tag>
      );
    }

    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag
          start={block.ordered ? block.start : undefined}
          className={`text-body ml-5 space-y-2 ${block.ordered ? 'list-decimal' : 'list-disc'}`}
        >
          {block.items.map((item, i) => (
            <li key={i} className="leading-relaxed">
              {item.map(renderBlock)}
            </li>
          ))}
        </Tag>
      );
    }

    case 'quote':
      return (
        <blockquote className="border-border text-muted-foreground border-l-4 pl-4 italic">
          {block.children.map(renderBlock)}
        </blockquote>
      );

    case 'code':
      return (
        <pre className="bg-card text-footnote overflow-x-auto rounded-[var(--radius)] p-4">
          <code>{block.text}</code>
        </pre>
      );

    case 'table':
      return (
        // Its own scroller: a wide table must not make the document scroll
        // sideways on a phone.
        <div className="overflow-x-auto">
          <table className="text-footnote w-full border-collapse">
            <thead>
              <tr>
                {block.head.map((cell, i) => (
                  <th
                    key={i}
                    className="border-border border-b-2 px-3 py-2 text-left font-bold"
                    style={{ textAlign: block.align[i] ?? 'left' }}
                  >
                    {inline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      className="border-border border-b px-3 py-2"
                      style={{ textAlign: block.align[c] ?? 'left' }}
                    >
                      {inline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'rule':
      return <hr className="border-border my-8 border-t-2" />;
  }
}

function inline(nodes: Inline[]): ReactNode {
  return nodes.map((node, i) => <InlineView key={i} node={node} />);
}

function InlineView({ node }: { node: Inline }): ReactNode {
  switch (node.kind) {
    case 'text':
      return <Fragment>{node.text}</Fragment>;
    case 'strong':
      return <strong className="font-bold">{inline(node.children)}</strong>;
    case 'em':
      return <em className="italic">{inline(node.children)}</em>;
    case 'strike':
      return <s>{inline(node.children)}</s>;
    case 'code':
      return <code className="bg-card rounded px-1 py-0.5 text-[0.9em]">{node.text}</code>;
    case 'link':
      return (
        /*
         * `nofollow` on everything the model wrote. These links were chosen by
         * a language model and reviewed by a person for whether the sentence is
         * true, which is not the same as vouching for the destination — and
         * outbound links from a page a model wrote are exactly the pattern that
         * makes a site look like a link farm.
         */
        <a href={node.href} rel="nofollow noopener" className="underline underline-offset-2">
          {inline(node.children)}
        </a>
      );
  }
}
