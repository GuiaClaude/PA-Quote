import { en, type Dictionary } from "./en";

/**
 * Today the app is English only. To add Filipino/Taglish later:
 *   1. copy en.ts to fil.ts and translate the values,
 *   2. add it to `dictionaries` below,
 *   3. pick the locale from the user's profile.
 */
const dictionaries: Record<string, Dictionary> = { en };

export function getDictionary(locale = "en"): Dictionary {
  return dictionaries[locale] ?? en;
}

export const t = getDictionary();
