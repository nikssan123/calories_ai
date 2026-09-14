import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import { useType } from '@/theme';

/**
 * A line in the serif, with one word allowed to lean.
 *
 * The serif moments are sentences with a beat in them — "What are you *here*
 * to do?", "Good *evening*" — and the beat is a light italic on one word. The
 * word is marked in the message itself with asterisks, because which word
 * carries the stress is a decision about the language rather than about the
 * layout: Bulgarian does not stress the same word English does, and a
 * translation with no asterisks in it simply reads upright, which is always
 * correct.
 */
export function Serif({
  children,
  style,
  ...rest
}: { children: string; style?: StyleProp<TextStyle> } & Omit<TextProps, 'children' | 'style'>) {
  const type = useType();
  const parts = children.split('*');
  return (
    <Text style={style} {...rest}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Text key={i} style={type.serifItalic}>
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

/** The same line with the marks taken out, for an accessibility label. */
export const plain = (text: string): string => text.replace(/\*/g, '');
