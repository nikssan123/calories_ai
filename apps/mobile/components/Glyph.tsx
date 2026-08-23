import Svg, { Path } from 'react-native-svg';

/**
 * The two marks a row's own actions are drawn with.
 *
 * Lucide's `trash-2` and `refresh-cw`, at lucide's 24-unit grid, for the same
 * reason the easings are copied rather than retuned: `lucide-react` is a DOM
 * library, two glyphs is not worth a dependency that has to track the web one
 * for shape, and two hand-drawn approximations of one icon would be two
 * products. They live here because four lists and a swipe panel draw them, and
 * the path data had already been copied into three files by hand.
 */
export function Glyph({
  icon,
  color,
  size = 15,
}: {
  icon: 'trash' | 'repeat';
  color: string;
  size?: number;
}) {
  const props = {
    stroke: color,
    strokeWidth: 2.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {icon === 'trash' ? (
        <Path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" {...props} />
      ) : (
        <Path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3H21m0 0V3m0 3h-2.3M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.7-3H3m0 0v3m0-3h2.3" {...props} />
      )}
    </Svg>
  );
}
