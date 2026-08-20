/**
 * A browser's FileReader hands back `data:image/jpeg;base64,…`; the model wants
 * the payload alone. Shared by the two routes that take a photo — the journal's
 * meal log and the kitchen's fridge scan — because a client that learned to
 * send one of them a data URL will send the other one too.
 */
export function stripDataUrl(value: string): string {
  const comma = value.indexOf(',');
  return value.startsWith('data:') && comma !== -1 ? value.slice(comma + 1) : value;
}
