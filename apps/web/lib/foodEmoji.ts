import type { Meal } from '@ct/shared';

/**
 * A picture for every logged thing.
 *
 * A list of meals is a list of *food*, and food is the most drawable subject
 * there is — but this app never asks anyone to pick from a database, so there
 * is no food id to look a picture up by. All there is is the sentence the user
 * typed. So: keywords, first match wins, and a per-meal fallback that is always
 * something rather than a grey square.
 *
 * Three rules keep this honest as it grows:
 *
 *   1. Specific before generic. "chicken soup" has to be reached by the soup
 *      rule, not by the chicken rule, so the table is ordered and the first hit
 *      wins. Adding a term at the bottom is safe; adding one at the top is not.
 *
 *   2. Match on word boundaries. Substring matching turns "hamburger" into ham
 *      and, memorably, "grapefruit" into grapes.
 *
 *   3. It is decoration. Nothing about the entry's meaning, its calories or its
 *      accessibility may depend on getting this right — every row still carries
 *      its description in words, and the emoji is `aria-hidden` wherever it is
 *      drawn. Being wrong is a shrug, not a bug.
 */

/** Ordered: earlier entries win, so put compounds above their ingredients. */
const TABLE: [RegExp, string][] = [
  // Composed dishes first — these contain the words below them.
  [/\b(pizza|margherita|pepperoni)\b/, '🍕'],
  [/\b(burger|cheeseburger|hamburger|big mac|whopper)\b/, '🍔'],
  [/\b(taco|tacos|burrito|quesadilla|fajita|nachos)\b/, '🌮'],
  [/\b(sushi|sashimi|maki|nigiri|poke)\b/, '🍣'],
  [/\b(ramen|pho|noodle|noodles|udon|soba|lo mein)\b/, '🍜'],
  [/\b(pasta|spaghetti|penne|lasagne|lasagna|carbonara|bolognese|linguine|fusilli)\b/, '🍝'],
  [/\b(curry|tikka|masala|korma|dahl|dal|biryani)\b/, '🍛'],
  [/\b(soup|broth|chowder|stew|bisque)\b/, '🍲'],
  [/\b(salad|caesar|coleslaw|slaw)\b/, '🥗'],
  [/\b(sandwich|sarnie|panini|sub|baguette|wrap|toastie|blt)\b/, '🥪'],
  [/\b(kebab|shawarma|gyro|souvlaki|doner)\b/, '🥙'],
  [/\b(dumpling|dumplings|gyoza|bao|dim sum|wonton)\b/, '🥟'],
  [/\b(stir fry|stir-fry|fried rice|risotto|paella|pilaf)\b/, '🍚'],
  [/\b(pancake|pancakes|waffle|waffles|crepe|crepes)\b/, '🥞'],
  [/\b(porridge|oatmeal|oats|granola|muesli|cereal|weetabix)\b/, '🥣'],
  [/\b(omelette|omelet|scrambled|frittata|shakshuka)\b/, '🍳'],
  [/\b(burrito bowl|bowl)\b/, '🥣'],
  [/\b(sausage roll|hot dog|hotdog|bratwurst)\b/, '🌭'],
  [/\b(fish and chips|fries|chips|wedges)\b/, '🍟'],
  [/\b(roast|sunday roast|casserole|shepherd'?s pie|cottage pie)\b/, '🍖'],

  // Proteins.
  [/\b(chicken|turkey|poultry|drumstick|nuggets)\b/, '🍗'],
  [/\b(steak|beef|mince|brisket|lamb|pork|bacon|ham|gammon|ribs)\b/, '🥩'],
  [/\b(salmon|tuna|cod|haddock|fish|prawn|prawns|shrimp|mackerel|sardine)\b/, '🐟'],
  [/\b(egg|eggs|boiled egg)\b/, '🥚'],
  [/\b(tofu|tempeh|seitan|falafel)\b/, '🧆'],
  [/\b(beans|lentils|chickpeas|hummus|houmous)\b/, '🫘'],

  // Carb bases.
  [/\b(bread|toast|bagel|roll|sourdough|crumpet|pitta|pita|naan)\b/, '🍞'],
  [/\b(rice|sushi rice|basmati|jasmine rice)\b/, '🍚'],
  [/\b(potato|potatoes|mash|jacket)\b/, '🥔'],
  [/\b(sweet potato|yam)\b/, '🍠'],
  [/\b(croissant|pain au chocolat|pastry|danish)\b/, '🥐'],

  // Fruit and veg.
  [/\b(avocado|guacamole)\b/, '🥑'],
  [/\b(banana|bananas)\b/, '🍌'],
  [/\b(apple|apples)\b/, '🍎'],
  [/\b(orange|oranges|clementine|satsuma|tangerine)\b/, '🍊'],
  [/\b(grapefruit)\b/, '🍊'],
  [/\b(berries|strawberry|strawberries)\b/, '🍓'],
  [/\b(blueberry|blueberries)\b/, '🫐'],
  [/\b(grape|grapes)\b/, '🍇'],
  [/\b(watermelon|melon)\b/, '🍉'],
  [/\b(peach|nectarine|apricot)\b/, '🍑'],
  [/\b(pear|pears)\b/, '🍐'],
  [/\b(pineapple)\b/, '🍍'],
  [/\b(mango)\b/, '🥭'],
  [/\b(tomato|tomatoes)\b/, '🍅'],
  [/\b(broccoli|greens|spinach|kale|veg|vegetables|courgette|zucchini)\b/, '🥦'],
  [/\b(carrot|carrots)\b/, '🥕'],
  [/\b(corn|sweetcorn)\b/, '🌽'],
  [/\b(mushroom|mushrooms)\b/, '🍄'],
  [/\b(cucumber|pickle|gherkin)\b/, '🥒'],

  // Dairy.
  [/\b(cheese|cheddar|mozzarella|feta|parmesan|halloumi|brie)\b/, '🧀'],
  [/\b(yoghurt|yogurt|skyr|quark)\b/, '🥛'],
  [/\b(milk|latte|flat white|cappuccino|milkshake)\b/, '🥛'],
  [/\b(butter|ghee)\b/, '🧈'],

  // Snacks and sweets.
  [/\b(chocolate|choc|brownie|cocoa)\b/, '🍫'],
  [/\b(biscuit|biscuits|cookie|cookies)\b/, '🍪'],
  [/\b(cake|muffin|cupcake|brownies)\b/, '🍰'],
  [/\b(doughnut|donut)\b/, '🍩'],
  [/\b(ice cream|gelato|sorbet)\b/, '🍨'],
  [/\b(sweets|candy|haribo|gummy)\b/, '🍬'],
  [/\b(crisps|popcorn|pretzel)\b/, '🍿'],
  [/\b(nuts|almonds|peanut|cashew|walnut)\b/, '🥜'],
  [/\b(protein bar|protein shake|whey|shake)\b/, '🥤'],

  // Drinks.
  [/\b(coffee|espresso|americano)\b/, '☕'],
  [/\b(tea|chai|matcha)\b/, '🍵'],
  [/\b(beer|lager|ale|pint|cider)\b/, '🍺'],
  [/\b(wine|prosecco|champagne)\b/, '🍷'],
  [/\b(cocktail|gin|vodka|whisky|whiskey|rum)\b/, '🍸'],
  [/\b(juice|smoothie|orange juice)\b/, '🧃'],
  [/\b(coke|cola|soda|lemonade|fizzy)\b/, '🥤'],
  [/\b(water)\b/, '💧'],
  [/\b(honey|syrup|jam)\b/, '🍯'],
];

const MEAL_FALLBACK: Record<Meal, string> = {
  breakfast: '🍳',
  lunch: '🥪',
  dinner: '🍽️',
  snack: '🍪',
};

/** A picture for a logged meal. Never empty — falls back on the meal itself. */
export function foodEmoji(description: string, meal?: Meal | string): string {
  const text = description.toLowerCase();
  for (const [pattern, emoji] of TABLE) {
    if (pattern.test(text)) return emoji;
  }
  return MEAL_FALLBACK[meal as Meal] ?? '🍽️';
}

/**
 * The same idea for exercise, which has a far smaller vocabulary and so gets a
 * far shorter table.
 */
const EXERCISE_TABLE: [RegExp, string][] = [
  [/\b(run|running|ran|jog|jogging|5k|10k|marathon|park ?run)\b/, '🏃'],
  [/\b(walk|walking|walked|steps|hike|hiking|ramble)\b/, '🚶'],
  [/\b(cycle|cycling|bike|biking|ride|spin|peloton)\b/, '🚴'],
  [/\b(swim|swimming|swam|pool|lengths)\b/, '🏊'],
  [/\b(gym|weights?|weight training|lifting|deadlift|squat|bench|strength|reps)\b/, '🏋️'],
  [/\b(yoga|pilates|stretch|stretching|mobility)\b/, '🧘'],
  [/\b(football|soccer|match)\b/, '⚽'],
  [/\b(tennis|padel|squash|badminton)\b/, '🎾'],
  [/\b(basketball)\b/, '🏀'],
  [/\b(climb|climbing|bouldering)\b/, '🧗'],
  [/\b(row|rowing|erg)\b/, '🚣'],
  [/\b(dance|dancing|zumba)\b/, '💃'],
  [/\b(hiit|circuit|crossfit|bootcamp|workout)\b/, '🤸'],
  [/\b(ski|skiing|snowboard)\b/, '⛷️'],
  [/\b(box|boxing|martial|karate|judo)\b/, '🥊'],
];

/** A picture for a logged burn. Falls back to a generic bit of movement. */
export function exerciseEmoji(description: string): string {
  const text = description.toLowerCase();
  for (const [pattern, emoji] of EXERCISE_TABLE) {
    if (pattern.test(text)) return emoji;
  }
  return '🏃';
}
