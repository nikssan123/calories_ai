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
 *      The awkward cases are the ones where a dish is spelled out of its own
 *      ingredients — cheesecake, banana bread, sweet potato, peanut butter,
 *      apple juice — and each of those is a line sitting deliberately above the
 *      ingredient it would otherwise be caught by.
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
  [/\b(pizza|margherita|pepperoni|calzone)\b/, '🍕'],
  [/\b(burger|cheeseburger|hamburger|big mac|whopper|patty)\b/, '🍔'],
  [/\b(taco|tacos|burrito|quesadilla|fajita|fajitas|nachos|enchilada|enchiladas)\b/, '🌮'],
  [/\b(sushi|sashimi|maki|nigiri|poke)\b/, '🍣'],
  [/\b(onigiri|rice ball|rice balls)\b/, '🍙'],
  [/\b(bento|katsu|teriyaki|tempura)\b/, '🍱'],
  [/\b(ramen|pho|noodle|noodles|udon|soba|lo mein|chow mein|pad thai|yakisoba)\b/, '🍜'],
  [
    /\b(pasta|spaghetti|penne|lasagne|lasagna|carbonara|bolognese|linguine|fusilli|tagliatelle|ravioli|tortellini|gnocchi|macaroni|mac and cheese|orzo)\b/,
    '🍝',
  ],
  [/\b(curry|tikka|masala|korma|dahl|dal|biryani|rogan josh)\b/, '🍛'],
  [/\b(soup|broth|chowder|stew|bisque|goulash|chilli con carne|chili con carne)\b/, '🍲'],
  [/\b(salad|caesar|coleslaw|slaw|tabbouleh)\b/, '🥗'],
  [/\b(sandwich|sarnie|panini|sub|baguette|wrap|toastie|blt)\b/, '🥪'],
  [/\b(kebab|shawarma|gyro|souvlaki|doner)\b/, '🥙'],
  [/\b(dumpling|dumplings|gyoza|bao|dim sum|wonton|pierogi|spring roll|spring rolls|samosa|empanada)\b/, '🥟'],
  [/\b(skewer|skewers|yakitori|satay|brochette)\b/, '🍢'],
  [/\b(stir fry|stir-fry|fried rice|risotto|paella|pilaf|jambalaya)\b/, '🍚'],
  [/\b(pancake|pancakes|crepe|crepes|blini)\b/, '🥞'],
  [/\b(waffle|waffles)\b/, '🧇'],
  [/\b(porridge|oatmeal|oats|granola|muesli|cereal|weetabix)\b/, '🥣'],
  [/\b(omelette|omelet|scrambled|frittata|shakshuka|eggs benedict|full english)\b/, '🍳'],
  [/\b(burrito bowl|bowl)\b/, '🥣'],
  [/\b(sausage|sausages|sausage roll|hot dog|hotdog|bratwurst|banger|bangers)\b/, '🌭'],
  [/\b(fish and chips|fries|chips|wedges|hash brown|hash browns)\b/, '🍟'],
  [/\b(roast|sunday roast|casserole|shepherd'?s pie|cottage pie|schnitzel|meatball|meatballs|meatloaf)\b/, '🍖'],
  [/\b(pie|quiche|tart|pasty|pastie)\b/, '🥧'],

  // Puddings spelled out of an ingredient, above the ingredient they name.
  [/\b(cheesecake|cheese cake|carrot cake|banana bread)\b/, '🍰'],

  // Drinks spelled out of a fruit, above the fruit.
  [/\b(juice|smoothie)\b/, '🧃'],

  // Proteins.
  [/\b(chicken|turkey|poultry|drumstick|nuggets|duck|wings)\b/, '🍗'],
  [/\b(bacon|pancetta|lardon|lardons|prosciutto|salami|chorizo|pastrami|charcuterie)\b/, '🥓'],
  [/\b(steak|beef|mince|brisket|lamb|pork|ham|gammon|ribs|sirloin|venison)\b/, '🥩'],
  [/\b(prawn|prawns|shrimp|scampi)\b/, '🍤'],
  [/\b(lobster|langoustine)\b/, '🦞'],
  [/\b(crab)\b/, '🦀'],
  [/\b(oyster|oysters|mussels|clams|scallops)\b/, '🦪'],
  [/\b(squid|calamari|octopus)\b/, '🦑'],
  [
    /\b(salmon|tuna|cod|haddock|fish|mackerel|sardine|sardines|trout|sea bass|seabass|halibut|anchovy|anchovies)\b/,
    '🐟',
  ],
  [/\b(egg|eggs|boiled egg|poached egg)\b/, '🥚'],
  [/\b(tofu|tempeh|seitan|falafel|quorn)\b/, '🧆'],
  [/\b(beans|lentils|chickpeas|hummus|houmous|edamame)\b/, '🫘'],

  // Carb bases. Pastries and the ones with their own picture sit above bread,
  // which would otherwise swallow "cinnamon roll" and "bagel".
  [/\b(croissant|pain au chocolat|pastry|danish|scone|cinnamon roll)\b/, '🥐'],
  [/\b(bagel|bagels)\b/, '🥯'],
  [/\b(pretzel|pretzels)\b/, '🥨'],
  [/\b(flatbread|tortilla|naan|pitta|pita|roti|chapati)\b/, '🫓'],
  [/\b(bread|toast|roll|sourdough|crumpet|english muffin|brioche|focaccia|ciabatta)\b/, '🍞'],
  [/\b(rice|sushi rice|basmati|jasmine rice|couscous|quinoa|bulgur)\b/, '🍚'],
  [/\b(sweet potato|sweet potatoes|yam)\b/, '🍠'],
  [/\b(potato|potatoes|mash|jacket)\b/, '🥔'],
  [/\b(cracker|crackers|rice cake|rice cakes|oatcake|oatcakes)\b/, '🍘'],

  // Fruit and veg.
  [/\b(avocado|guacamole)\b/, '🥑'],
  [/\b(banana|bananas)\b/, '🍌'],
  [/\b(apple|apples)\b/, '🍎'],
  [/\b(orange|oranges|clementine|satsuma|tangerine|mandarin)\b/, '🍊'],
  [/\b(grapefruit)\b/, '🍊'],
  [/\b(lemon|lemons|lime|limes)\b/, '🍋'],
  [/\b(berries|strawberry|strawberries|raspberry|raspberries|blackberry|blackberries)\b/, '🍓'],
  [/\b(blueberry|blueberries)\b/, '🫐'],
  [/\b(grape|grapes|raisins|sultanas)\b/, '🍇'],
  [/\b(watermelon|melon|cantaloupe|honeydew)\b/, '🍉'],
  [/\b(peach|nectarine|apricot|plum|plums)\b/, '🍑'],
  [/\b(pear|pears)\b/, '🍐'],
  [/\b(pineapple)\b/, '🍍'],
  [/\b(mango)\b/, '🥭'],
  [/\b(kiwi)\b/, '🥝'],
  [/\b(cherry|cherries)\b/, '🍒'],
  [/\b(coconut)\b/, '🥥'],
  [/\b(olive|olives)\b/, '🫒'],
  [/\b(tomato|tomatoes)\b/, '🍅'],
  [/\b(broccoli|greens|spinach|kale|veg|vegetables|courgette|zucchini|asparagus|green beans|sprouts)\b/, '🥦'],
  [/\b(lettuce|cabbage|rocket|arugula|kimchi|pak choi|chard)\b/, '🥬'],
  [/\b(carrot|carrots)\b/, '🥕'],
  [/\b(corn|sweetcorn)\b/, '🌽'],
  [/\b(mushroom|mushrooms)\b/, '🍄'],
  [/\b(cucumber|pickle|pickles|gherkin)\b/, '🥒'],
  [/\b(bell pepper|peppers|capsicum)\b/, '🫑'],
  [/\b(chilli|chili|jalapeno|jalapenos|sriracha|hot sauce)\b/, '🌶️'],
  [/\b(aubergine|eggplant)\b/, '🍆'],
  [/\b(garlic)\b/, '🧄'],
  [/\b(onion|onions|leek|leeks|shallot|shallots)\b/, '🧅'],
  [/\b(peas|mangetout|petit pois)\b/, '🫛'],
  [/\b(pumpkin|butternut)\b/, '🎃'],

  // Dairy.
  [/\b(cheese|cheddar|mozzarella|feta|parmesan|halloumi|brie|burrata|ricotta|mascarpone)\b/, '🧀'],
  [/\b(yoghurt|yogurt|skyr|quark)\b/, '🥛'],
  [/\b(milk|latte|flat white|cappuccino|milkshake)\b/, '🥛'],
  [/\b(peanut butter|almond butter|nut butter)\b/, '🥜'],
  [/\b(butter|ghee|margarine)\b/, '🧈'],

  // Snacks and sweets.
  [/\b(chocolate|choc|brownie|brownies|cocoa|nutella)\b/, '🍫'],
  [/\b(biscuit|biscuits|cookie|cookies|digestive|digestives|oreo|oreos)\b/, '🍪'],
  [/\b(cupcake|cupcakes|muffin|muffins)\b/, '🧁'],
  [/\b(cake|gateau|sponge|tiramisu)\b/, '🍰'],
  [/\b(doughnut|donut|doughnuts|donuts)\b/, '🍩'],
  [/\b(ice cream|gelato|sorbet|ice lolly|popsicle)\b/, '🍨'],
  [/\b(custard|pudding|creme brulee|panna cotta|flan)\b/, '🍮'],
  [/\b(mochi|dango)\b/, '🍡'],
  [/\b(lollipop|lolly)\b/, '🍭'],
  [/\b(sweets|candy|haribo|gummy|marshmallow|jelly)\b/, '🍬'],
  [/\b(crisps|popcorn)\b/, '🍿'],
  [/\b(nuts|almonds|peanut|peanuts|cashew|cashews|walnut|walnuts|pistachio|pistachios|pecan|pecans|seeds)\b/, '🥜'],
  [/\b(protein bar|protein shake|whey|shake)\b/, '🥤'],

  // Drinks.
  [/\b(bubble tea|boba)\b/, '🧋'],
  [/\b(coffee|espresso|americano|mocha|cortado)\b/, '☕'],
  [/\b(tea|chai|matcha)\b/, '🍵'],
  [/\b(beer|lager|ale|pint|cider|ipa)\b/, '🍺'],
  [/\b(champagne)\b/, '🍾'],
  [/\b(wine|prosecco|merlot|rioja|malbec|sauvignon)\b/, '🍷'],
  [/\b(sake|soju)\b/, '🍶'],
  [/\b(cocktail|gin|vodka|whisky|whiskey|rum|tequila|mojito|margarita|negroni|aperol)\b/, '🍸'],
  [/\b(coke|cola|soda|lemonade|fizzy|pepsi|sprite|energy drink|red bull)\b/, '🥤'],
  [/\b(water)\b/, '💧'],

  // Store cupboard — rarely the whole entry, so they sit last.
  [/\b(honey|syrup|jam|marmalade|maple)\b/, '🍯'],
  [/\b(salt|seasoning|spices)\b/, '🧂'],
  [/\b(herbs|basil|coriander|parsley|mint|thyme)\b/, '🌿'],
  [/\b(ginger)\b/, '🫚'],
  [/\b(takeaway|takeout|leftovers)\b/, '🥡'],
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
