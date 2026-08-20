import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * "chicken, garlic and spinach" — a sentence, not a comma-separated list.
 *
 * Lives here rather than beside one of its callers because both halves of Cook
 * and both recipe pages say this same sentence about the same pantry.
 */
export function listWords(items: string[]): string {
  const lower = items.map((i) => i.toLowerCase());
  if (lower.length === 1) return lower[0]!;
  if (lower.length === 2) return `${lower[0]} and ${lower[1]}`;
  return `${lower.slice(0, -1).join(', ')} and ${lower.at(-1)}`;
}
