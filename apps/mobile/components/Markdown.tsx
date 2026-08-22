import { memo, useMemo } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { parseBlocks, type Align, type Block, type Inline } from '@ct/shared/markdown';
import { font, MONO, type as t, useColors, type Palette } from '@/theme';

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
 * sit in the same column and read as the same voice.
 *
 * The parser is shared with the web — `@ct/shared/markdown`, source in and a
 * small tree out — so the two clients cannot disagree about what a reply says.
 * Only the drawing is native, and the difference that drives it is that RN has
 * no inline layout: there is no `<strong>` inside a paragraph, only a `Text`
 * inside a `Text`. That nests correctly and inherits, which is what makes this
 * a port rather than a rewrite — but it is also why emphasis has to resolve to
 * a *face* rather than to a weight, exactly as the rest of the type scale does.
 *
 * Every frame of a streamed reply comes through here, so the parse is memoised
 * on the text and the whole component on its props: a token arriving re-parses
 * one bubble, not the thread.
 */
export const Markdown = memo(function Markdown({
  text,
  style,
}: {
  text: string;
  style?: TextStyle;
}) {
  const colors = useColors();
  const blocks = useMemo(() => parseBlocks(text), [text]);

  return (
    <View style={styles.stack}>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} colors={colors} style={style} />
      ))}
    </View>
  );
});

function BlockView({
  block,
  colors,
  style,
}: {
  block: Block;
  colors: Palette;
  style?: TextStyle;
}) {
  const base: TextStyle = { color: colors.foreground, ...t.body, lineHeight: 24, ...style };

  switch (block.kind) {
    case 'paragraph':
      // RN keeps the newlines a model typed, which markdown would fold into a
      // space. A reply that lists three things on three lines without bothering
      // with hyphens is commoner than either.
      return <Text style={base}>{renderInline(block.content, colors, base)}</Text>;

    case 'heading': {
      // A heading in a bubble is a heavier line, not a banner — there is no
      // document outline here to rank it in, only a conversation to stay inside.
      const heading: TextStyle = {
        ...base,
        fontFamily: font.display,
        fontSize: block.level <= 2 ? 17 : base.fontSize,
      };
      return <Text style={heading}>{renderInline(block.content, colors, heading)}</Text>;
    }

    case 'list':
      return (
        <View style={styles.list}>
          {block.items.map((item, i) => (
            <View key={i} style={styles.item}>
              {/*
                There is no `list-style` to lean on, so the marker is drawn. It
                is a sibling of the text rather than part of it so that a wrapped
                second line hangs under the first word instead of under the dot.
              */}
              <Text style={[base, styles.marker, { color: colors.mutedForeground }]}>
                {block.ordered ? `${block.start + i}.` : '•'}
              </Text>
              <View style={styles.itemBody}>
                <ItemBody blocks={item} colors={colors} style={style} />
              </View>
            </View>
          ))}
        </View>
      );

    case 'quote':
      return (
        <View style={[styles.quote, { borderLeftColor: colors.border }]}>
          {block.children.map((child, i) => (
            <BlockView
              key={i}
              block={child}
              colors={colors}
              style={{ ...style, color: colors.mutedForeground }}
            />
          ))}
        </View>
      );

    case 'code':
      return (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.fence, { backgroundColor: colors.muted, borderColor: colors.border }]}
          contentContainerStyle={styles.fenceBody}
        >
          <Text style={[t.footnote, { fontFamily: MONO, color: colors.foreground }]}>
            {block.text}
          </Text>
        </ScrollView>
      );

    case 'table':
      return <TableView block={block} colors={colors} />;

    case 'rule':
      return <View style={[styles.rule, { borderTopColor: colors.border }]} />;
  }
}

/**
 * A list item's contents, unwrapped when there is only the one paragraph —
 * which is nearly always, and a block wrapper would put paragraph spacing
 * between the bullet and its own words.
 */
function ItemBody({
  blocks,
  colors,
  style,
}: {
  blocks: Block[];
  colors: Palette;
  style?: TextStyle;
}) {
  const only = blocks.length === 1 ? blocks[0] : undefined;
  if (only?.kind === 'paragraph') {
    const base: TextStyle = { color: colors.foreground, ...t.body, lineHeight: 24, ...style };
    return <Text style={base}>{renderInline(only.content, colors, base)}</Text>;
  }
  return (
    <View style={styles.stack}>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} colors={colors} style={style} />
      ))}
    </View>
  );
}

/**
 * A table, kept inside its own scroller.
 *
 * Rare in a reply and rarer still that it is the right shape for a phone — the
 * cards are what data is meant to arrive as. But a model that has decided on a
 * table will send one, and pipes and dashes down the bubble are worse than a
 * small table that scrolls sideways on its own without dragging the screen with
 * it. Cells are laid out against the header, so a short row still lines up.
 */
function TableView({
  block,
  colors,
}: {
  block: Extract<Block, { kind: 'table' }>;
  colors: Palette;
}) {
  const cell: TextStyle = { ...t.footnote, color: colors.foreground };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.table, { borderColor: colors.border }]}
      /*
       * `w-full` on the web, and it has to be said twice here. The scroller
       * exists for a table too wide to fit, but without this its content sizes
       * to the text and a two-column table sits in the left half of its own
       * border with the rest empty. The floor is the full width; the cells'
       * `flex` then shares it out, and anything that genuinely does not fit
       * pushes past and scrolls.
       */
      contentContainerStyle={styles.tableBody}
    >
      <View style={styles.flex}>
        <View style={[styles.row, { backgroundColor: colors.muted, borderBottomColor: colors.border, borderBottomWidth: 2 }]}>
          {block.head.map((head, i) => (
            <Text
              key={i}
              style={[styles.cell, cell, { fontFamily: font.extrabold }, column(block.align[i])]}
            >
              {renderInline(head, colors, cell)}
            </Text>
          ))}
        </View>

        {block.rows.map((row, r) => (
          <View
            key={r}
            style={[
              styles.row,
              r === block.rows.length - 1
                ? null
                : { borderBottomWidth: 1, borderBottomColor: colors.border },
            ]}
          >
            {block.head.map((_, c) => (
              <Text key={c} style={[styles.cell, cell, t.tnum, column(block.align[c])]}>
                {renderInline(row[c] ?? [], colors, cell)}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function column(align: Align | undefined): TextStyle {
  return { textAlign: align === 'right' ? 'right' : align === 'center' ? 'center' : 'left' };
}

/**
 * Inline nodes as nested `Text`.
 *
 * `inherited` is carried down by hand because RN inherits the *rendered* style
 * but gives a child no way to read it — and emphasis has to be resolved against
 * what it is sitting in. `**bold**` inside `*italic*` is one face, not two
 * requests: without this the inner node would name a family and silently drop
 * the outer one, so a bold word inside an emphasised clause came out upright.
 */
function renderInline(nodes: Inline[], colors: Palette, inherited: TextStyle): React.ReactNode {
  return nodes.map((node, i) => {
    switch (node.kind) {
      case 'text':
        return node.text;

      case 'strong': {
        // The app runs a step heavier than regular everywhere, so bold goes to
        // 800 to read as bold rather than as a slightly darker sentence.
        const style: TextStyle = {
          ...inherited,
          fontFamily: isItalic(inherited) ? font.boldItalic : font.extrabold,
        };
        return (
          <Text key={i} style={style}>
            {renderInline(node.children, colors, style)}
          </Text>
        );
      }

      case 'em': {
        const style: TextStyle = {
          ...inherited,
          fontFamily: isBold(inherited) ? font.boldItalic : font.italic,
        };
        return (
          <Text key={i} style={style}>
            {renderInline(node.children, colors, style)}
          </Text>
        );
      }

      case 'strike': {
        const style: TextStyle = {
          ...inherited,
          color: colors.mutedForeground,
          textDecorationLine: 'line-through',
        };
        return (
          <Text key={i} style={style}>
            {renderInline(node.children, colors, style)}
          </Text>
        );
      }

      case 'code':
        return (
          <Text
            key={i}
            style={{
              ...inherited,
              fontFamily: MONO,
              // 0.875em on the web; RN has no relative sizes, so it is resolved
              // against whatever this run inherited.
              fontSize: Math.round((inherited.fontSize ?? 16) * 0.875),
              backgroundColor: colors.muted,
            }}
          >
            {node.text}
          </Text>
        );

      case 'link': {
        const style: TextStyle = {
          ...inherited,
          fontFamily: font.semibold,
          color: colors.caloriesDeep,
          textDecorationLine: 'underline',
        };
        return (
          <Text key={i} style={style} onPress={() => void Linking.openURL(node.href)}>
            {renderInline(node.children, colors, style)}
          </Text>
        );
      }
    }
  });
}

const isBold = (style: TextStyle) =>
  style.fontFamily === font.extrabold || style.fontFamily === font.boldItalic;
const isItalic = (style: TextStyle) =>
  style.fontFamily === font.italic || style.fontFamily === font.boldItalic;

const styles = StyleSheet.create({
  stack: { gap: 10 },
  list: { gap: 4 },
  item: { flexDirection: 'row', gap: 8 },
  marker: { minWidth: 16, textAlign: 'right' },
  itemBody: { flex: 1 },
  quote: { borderLeftWidth: 2, paddingLeft: 12, gap: 8 },
  fence: { borderWidth: 2, borderRadius: 24, flexGrow: 0 },
  fenceBody: { padding: 12 },
  rule: { borderTopWidth: 2 },
  table: { borderWidth: 2, borderRadius: 24, flexGrow: 0 },
  tableBody: { minWidth: '100%' },
  flex: { flex: 1 },
  row: { flexDirection: 'row' },
  cell: { flex: 1, paddingHorizontal: 10, paddingVertical: 6, minWidth: 84 },
});
