import { foodEmoji } from '@ct/shared/food-emoji';
import type { CastName } from '@ct/shared/cast';

/**
 * Who a food word belongs to, for the ledge perking up while a meal is typed
 * (CAST.md, fourth pass).
 *
 * `foodEmoji` already knows food words in five languages; this says which
 * macro most of each picture's calories usually come from. It is a guess about
 * what the food is, never about how much of it there is, and drinks, herbs and
 * salt answer nobody.
 */
const BY_EMOJI: Record<string, CastName> = {};
const assign = (name: CastName, emojis: string) => {
  for (const emoji of emojis.split(' ')) BY_EMOJI[emoji] = name;
};
assign('ember', '🍗 🥩 🍤 🦞 🦀 🦪 🦑 🐟 🥚 🍳 🍖');
assign(
  'skye',
  '🍕 🌮 🍣 🍙 🍱 🍜 🍝 🍛 🥪 🥙 🥟 🍚 🥞 🧇 🥣 🥔 🍟 🥧 🍰 🥯 🥨 🫓 🍞 🍠 🍘 🍌 🍎 🍊 🍋 🍓 🫐 🍇 🍉 🍑 🍐 🍍 🥭 🥝 🍒 🍅 🥦 🥬 🥕 🌽 🍄 🥒 🫑 🍆 🫛 🎃 🍪 🧁 🍩 🍮 🍡 🍭 🍬 🍿 🫘 🥡',
);
assign('plum', '🥑 🥓 🧀 🥜 🧈 🫒 🌭 🥐 🍫 🥥 🍔 🍨');

/** The newest food word in a draft and who it belongs to, or null. */
export function castForDraft(text: string): { name: CastName; word: string } | null {
  const words = text.toLowerCase().split(/[\s,.;:!?]+/).filter(Boolean);
  for (let i = words.length - 1; i >= 0; i--) {
    const pair = i > 0 ? `${words[i - 1]} ${words[i]}` : words[i]!;
    for (const candidate of [words[i]!, pair]) {
      const name = BY_EMOJI[foodEmoji(candidate)];
      if (name) return { name, word: candidate };
    }
  }
  return null;
}
