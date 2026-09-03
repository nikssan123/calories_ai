import Svg, { Circle, Path } from 'react-native-svg';

/**
 * The marks a row's own actions are drawn with.
 *
 * Lucide's `trash-2`, `refresh-cw`, `pencil`, `eye` and `eye-off`, at lucide's
 * 24-unit grid, for the same reason the easings are copied rather than retuned:
 * `lucide-react` is a DOM library, five glyphs is not worth a dependency that
 * has to track the web one for shape, and two hand-drawn approximations of one
 * icon would be two products. They live here because four lists, a swipe panel
 * and the sign-in form draw them, and the path data had already been copied
 * into three files by hand.
 */
export function Glyph({
  icon,
  color,
  size = 15,
}: {
  icon: 'trash' | 'repeat' | 'pencil' | 'eye' | 'eye-off';
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
      {icon === 'trash' && (
        <Path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" {...props} />
      )}
      {icon === 'repeat' && (
        <Path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3H21m0 0V3m0 3h-2.3M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.7-3H3m0 0v3m0-3h2.3" {...props} />
      )}
      {icon === 'pencil' && (
        <>
          <Path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" {...props} />
          <Path d="m15 5 4 4" {...props} />
        </>
      )}
      {icon === 'eye' && (
        <>
          <Path
            d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"
            {...props}
          />
          <Circle cx={12} cy={12} r={3} {...props} />
        </>
      )}
      {icon === 'eye-off' && (
        <>
          <Path d="M10.73 5.08a10.74 10.74 0 0 1 11.21 6.57 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-1.45 2.49" {...props} />
          <Path d="M14.08 14.16a3 3 0 0 1-4.24-4.24" {...props} />
          <Path d="M17.48 17.5a10.75 10.75 0 0 1-15.42-5.15 1 1 0 0 1 0-.7 10.75 10.75 0 0 1 4.45-5.14" {...props} />
          <Path d="m2 2 20 20" {...props} />
        </>
      )}
    </Svg>
  );
}
