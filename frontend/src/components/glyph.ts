import type { CatalogItem } from '../api/types';

const BY_NAME: [RegExp, string][] = [
  [/milk|curd|dahi|paneer|butter|cheese/i, '🥛'],
  [/bread|bun|pav|rusk/i, '🍞'],
  [/egg/i, '🥚'],
  [/rice|basmati/i, '🍚'],
  [/atta|flour|maida|suji/i, '🌾'],
  [/tea|chai/i, '🍵'],
  [/coffee/i, '☕'],
  [/oil|ghee/i, '🫗'],
  [/sugar|salt|masala|spice/i, '🧂'],
  [/dal|pulse|lentil|rajma|chana/i, '🫘'],
  [/biscuit|cookie|namkeen|chips/i, '🍪'],
  [/mosquito|repellent|knight|all\s*out/i, '🦟'],
  [/detergent|matic|washing|surf/i, '🧺'],
  [/dishwash|scrub|vim|sponge/i, '🧽'],
  [/garbage|trash|bin\b/i, '🗑️'],
  [/toilet|harpic|floor|phenyl/i, '🧴'],
  [/tissue|towel|napkin|roll/i, '🧻'],
  [/soap|handwash|bodywash/i, '🧼'],
  [/shampoo|conditioner|hair/i, '💆'],
  [/toothpaste|toothbrush|dental/i, '🪥'],
  [/moisturis|cream|lotion|nivea|ponds/i, '🧴'],
  [/razor|shave|trimmer/i, '🪒'],
  [/deodorant|perfume|spray/i, '💨'],
  [/sanitary|pad|wipes/i, '🩹'],
];

const BY_CATEGORY: [RegExp, string][] = [
  [/grocer|food|staple/i, '🛒'],
  [/household|home|clean/i, '🏠'],
  [/personal|care|beauty/i, '🧴'],
];

const TINTS = ['#fff1e8', '#eef7f1', '#f0f2fd', '#fdf3e6', '#f6effa', '#eaf6f9', '#fdf0f2', '#f2f6ea'];

export function productGlyph(item: CatalogItem): string {
  const named = BY_NAME.find(([pattern]) => pattern.test(item.name));
  if (named) return named[1];
  const category = BY_CATEGORY.find(([pattern]) => pattern.test(item.category));
  return category ? category[1] : '📦';
}

export function productTint(item: CatalogItem): string {
  return TINTS[item.id % TINTS.length];
}
