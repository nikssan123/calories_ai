import type { Meal } from './index.ts';

/**
 * A picture for every logged thing.
 *
 * A list of meals is a list of *food*, and food is the most drawable subject
 * there is — but this app never asks anyone to pick from a database, so there
 * is no food id to look a picture up by. All there is is the sentence the user
 * typed. So: keywords, first match wins, and a per-meal fallback that is always
 * something rather than a grey square.
 *
 * Four rules keep this honest as it grows:
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
 *   3. Five languages, one table. The app is drawn in five languages, and a
 *      food name is deliberately stored in whichever language it was typed in —
 *      see `locale.ts`: someone who logs "кюфте" gets an entry called "кюфте".
 *      An English-only table therefore matched *nothing at all* for anyone not
 *      writing English, and every row fell through to the meal fallback, which
 *      is how an iced tea logged at lunch came back as a sandwich. So each row
 *      carries its terms in all five languages together, and rule 1 then works
 *      across languages for free: `käsekuchen` rides with `cheesecake`, above
 *      `käse` and `cheese` both.
 *
 *   4. It is decoration. Nothing about the entry's meaning, its calories or its
 *      accessibility may depend on getting this right — every row still carries
 *      its description in words, and the emoji is `aria-hidden` wherever it is
 *      drawn. Being wrong is a shrug, not a bug.
 *
 * Terms are written lowercase and matched whole-word. Two suffix characters
 * exist for languages that inflect and compound where English does not:
 * a trailing `*` lets the term run on into the rest of a word (`домат*` for
 * домати and доматена, `*wurst` — leading — for Bratwurst and Leberwurst).
 * Neither is a licence to shorten an English term into a substring.
 */

/**
 * What counts as "inside a word".
 *
 * `\b` is ASCII-only, which is a quiet disaster here: it finds no boundary at
 * either end of "чай" and none after the "é" of "thé", so a term written with
 * it can never match. Spelling the class out — Latin with its diacritics, plus
 * Cyrillic — fixes that, and does it without `\p{…}` or lookbehind, neither of
 * which is worth betting on in Hermes on the phone. Input is lowercased before
 * matching, so only the lowercase halves need to be here.
 */
const LETTER = 'a-z0-9ß\\u00e0-\\u00f6\\u00f8-\\u00ff\\u0153\\u0430-\\u044f\\u0451';

/** One alternation per row: every term, each with the boundaries it asked for. */
function compile(terms: string[]): RegExp {
  const parts = terms.map((term) => {
    const openLeft = term.startsWith('*');
    const openRight = term.endsWith('*');
    const body = term.slice(openLeft ? 1 : 0, openRight ? -1 : undefined);
    const escaped = body.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const left = openLeft ? '' : `(?:^|[^${LETTER}])`;
    const right = openRight ? '' : `(?![${LETTER}])`;
    return `${left}${escaped}${right}`;
  });
  return new RegExp(parts.join('|'));
}

/** Ordered: earlier entries win, so put compounds above their ingredients. */
const TABLE: [string[], string][] = [
  // Composed dishes first — these contain the words below them.
  [['pizza', 'margherita', 'pepperoni', 'calzone', 'пица*'], '🍕'],
  [
    [
      'burger', 'cheeseburger', 'hamburger', 'big mac', 'whopper', 'patty',
      'бургер*', 'хамбургер*', 'чийзбургер*', 'hamburguesa*',
    ],
    '🍔',
  ],
  [
    [
      'taco', 'tacos', 'burrito', 'quesadilla', 'fajita', 'fajitas', 'nachos', 'enchilada', 'enchiladas',
      'тако', 'бурито', 'кесадия', 'начос', 'фахита*', 'quesadillas', 'fajitas',
    ],
    '🌮',
  ],
  [['sushi', 'sashimi', 'maki', 'nigiri', 'poke', 'суши', 'сашими', 'маки'], '🍣'],
  [['onigiri', 'rice ball', 'rice balls', 'онигири'], '🍙'],
  [['bento', 'katsu', 'teriyaki', 'tempura', 'бенто', 'терияки', 'темпура'], '🍱'],
  [
    [
      'ramen', 'pho', 'noodle', 'noodles', 'udon', 'soba', 'lo mein', 'chow mein', 'pad thai', 'yakisoba',
      'рамен', 'нудъл*', 'юфка', 'asia-nudeln', 'glasnudeln', 'reisnudeln',
      'fideos', 'tallarines', 'nouilles',
    ],
    '🍜',
  ],
  [
    [
      'pasta', 'spaghetti', 'penne', 'lasagne', 'lasagna', 'carbonara', 'bolognese', 'linguine', 'fusilli',
      'tagliatelle', 'ravioli', 'tortellini', 'gnocchi', 'macaroni', 'mac and cheese', 'orzo',
      // Bulgarian "паста" is a small iced cake as often as it is pasta, so it is
      // deliberately absent — the dish names are unambiguous and the word is not.
      'спагети', 'макарони', 'лазаня', 'равиоли', 'тортелини', 'ньоки', 'карбонара', 'болонезе',
      'nudel*', 'spätzle', 'spaetzle', 'maultaschen',
      'espaguetis', 'macarrones', 'lasaña', 'ñoquis',
      'pâtes', 'spaghettis', 'lasagnes', 'raviolis', 'gnocchis',
    ],
    '🍝',
  ],
  [
    [
      'curry', 'tikka', 'masala', 'korma', 'dahl', 'dal', 'biryani', 'rogan josh',
      'къри', 'биряни', 'kokoscurry',
    ],
    '🍛',
  ],
  [
    [
      'soup', 'broth', 'chowder', 'stew', 'bisque', 'goulash', 'chilli con carne', 'chili con carne',
      'супа*', 'чорба*', 'бульон', 'яхния', 'гулаш', 'таратор',
      '*suppe*', 'eintopf', 'gulasch', 'brühe', 'bruehe',
      'sopa', 'caldo', 'guiso', 'estofado', 'potaje', 'cocido',
      'soupe', 'potage', 'bouillon', 'ragoût', 'ragout', 'pot-au-feu',
    ],
    '🍲',
  ],
  [
    [
      'salad', 'caesar', 'coleslaw', 'slaw', 'tabbouleh',
      'салата*', 'шопска', 'снежанка',
      '*salat*',
      'ensalada*', 'salade*', 'taboulé', 'taboule',
    ],
    '🥗',
  ],
  [
    [
      'sandwich', 'sarnie', 'panini', 'sub', 'baguette', 'wrap', 'toastie', 'blt',
      'сандвич*', 'багета',
      'belegtes brot', 'butterbrot', 'stulle',
      'bocadillo*', 'bocata', 'sándwich',
      'croque-monsieur', 'croque monsieur',
    ],
    '🥪',
  ],
  [
    [
      'kebab', 'shawarma', 'gyro', 'souvlaki', 'doner',
      // "кебап" stays exact: `кебап*` would swallow "кебапче", which is a
      // different thing entirely and lives with the meatballs below.
      'кебап', 'кебапи', 'дюнер*', 'гирос', 'шаурма',
      'döner', 'doener', 'dürüm', 'duerum', 'gyros',
      'durum', 'chawarma',
    ],
    '🥙',
  ],
  [
    [
      'dumpling', 'dumplings', 'gyoza', 'bao', 'dim sum', 'wonton', 'pierogi', 'spring roll', 'spring rolls',
      'samosa', 'empanada',
      'кнедл*', 'гьоза', 'дим сум', 'пролетни ролца',
      'teigtaschen', 'knödel', 'knoedel', 'frühlingsrolle*',
      'empanadas', 'gyozas', 'samoussa', 'rouleau de printemps',
    ],
    '🥟',
  ],
  [
    [
      'skewer', 'skewers', 'yakitori', 'satay', 'brochette',
      'шишче*', 'шашлик',
      'spieß*', 'spiess*', 'schaschlik',
      'brocheta', 'pincho', 'pinchito', 'brochettes',
    ],
    '🍢',
  ],
  [
    [
      'stir fry', 'stir-fry', 'fried rice', 'risotto', 'paella', 'pilaf', 'jambalaya',
      'ризото', 'паеля', 'пържен ориз', 'пилаф',
      'gebratener reis', 'pfannengericht', 'wokgericht',
      'arroz frito', 'salteado', 'riz sauté', 'riz saute',
    ],
    '🍚',
  ],
  [
    [
      'pancake', 'pancakes', 'crepe', 'crepes', 'blini',
      'палачинк*',
      'pfannkuchen', 'eierkuchen', 'crêpe*',
      'panqueque*', 'tortita*', 'pancake*',
    ],
    '🥞',
  ],
  [['waffle', 'waffles', 'гофрет*', 'waffel*', 'gofre*', 'gaufre*'], '🧇'],
  [
    [
      'porridge', 'oatmeal', 'oats', 'granola', 'muesli', 'cereal', 'weetabix',
      'овесен*', 'овесена каша', 'каша', 'мюсли', 'гранола', 'зърнена закуска',
      'haferbrei', 'haferflocken', 'müsli', 'cornflakes',
      'avena', 'gachas', 'cereales', 'granola',
      'flocons', 'avoine', 'céréales', 'cereales',
    ],
    '🥣',
  ],
  [
    [
      'omelette', 'omelet', 'scrambled', 'frittata', 'shakshuka', 'eggs benedict', 'full english',
      'омлет*', 'бъркани яйца', 'яйца на очи', 'пържени яйца',
      'omelett*', 'rührei*', 'ruehrei*', 'spiegelei*',
      // Bare "tortilla" is the flatbread further down; the Spanish omelette
      // only wins when it says which one it is.
      'tortilla de patatas', 'tortilla española', 'tortilla francesa', 'huevos revueltos', 'huevos fritos',
      'œufs brouillés', 'oeufs brouilles', 'œuf au plat', 'oeuf au plat',
    ],
    '🍳',
  ],
  [['burrito bowl', 'bowl', 'боул'], '🥣'],
  [
    [
      'sausage', 'sausages', 'sausage roll', 'hot dog', 'hotdog', 'bratwurst', 'banger', 'bangers',
      'наденица*', 'наденички', 'кренвирш*', 'хот дог',
      '*wurst*', 'würstchen', 'wuerstchen',
      'salchicha*', 'perrito caliente',
      'saucisse*', 'hot-dog',
    ],
    '🌭',
  ],
  // "Pommes" is chips in German and apples in French, and "pommes de terre" is
  // neither, so the French potato has to be reached before the German chip.
  // Bare plural "pommes" is genuinely ambiguous and goes to the chips; "pomme"
  // singular is not, and is left to the apples further down.
  [['pomme de terre', 'pommes de terre'], '🥔'],
  [
    [
      'fish and chips', 'fries', 'chips', 'wedges', 'hash brown', 'hash browns',
      'пържени картофи', 'картофки', 'чипс',
      'pommes', 'pommes frites', 'fritten', 'kartoffelchips',
      'patatas fritas', 'papas fritas', 'papitas',
      'frites',
    ],
    '🍟',
  ],
  [
    [
      'roast', 'sunday roast', 'casserole', "shepherd's pie", 'shepherds pie', 'cottage pie', 'schnitzel',
      'meatball', 'meatballs', 'meatloaf',
      'кюфте*', 'кебапче*', 'печено', 'мусака*', 'кавърма', 'гювеч', 'шницел',
      '*braten', 'frikadelle*', 'hackbraten', 'boulette*', 'königsberger klopse',
      'asado', 'albóndiga*', 'albondiga*', 'escalope', 'milanesa',
      'rôti', 'roti de', 'hachis parmentier',
    ],
    '🍖',
  ],
  [
    [
      'pie', 'quiche', 'tart', 'pasty', 'pastie',
      'баница*', 'пай', 'киш', 'тарт*', 'щрудел',
      'apfelstrudel', 'pastete', 'blätterteig',
      'tarta salada', 'pastel salado', 'empanada gallega',
      'tarte', 'tourte', 'feuilleté', 'feuillete',
    ],
    '🥧',
  ],

  // Puddings spelled out of an ingredient, above the ingredient they name.
  [
    [
      'cheesecake', 'cheese cake', 'carrot cake', 'banana bread',
      'чийзкейк', 'бананов хляб', 'морковена торта',
      // German cakes are one word each, so the whole family comes in at once.
      // "Pfannkuchen" is a pancake and was caught further up.
      '*kuchen', 'bananenbrot',
      'tarta de queso', 'pastel de queso', 'tarta de zanahoria', 'pastel de zanahoria', 'pan de plátano',
      'gâteau au fromage', 'gâteau aux carottes', 'cake à la banane',
    ],
    '🍰',
  ],

  // Drinks spelled out of a fruit, above the fruit.
  [
    [
      'juice', 'smoothie',
      'сок*', 'смути', 'фреш',
      'saft', '*saft', 'schorle',
      'zumo*', 'jugo*', 'licuado*',
      'jus', 'smoothies',
    ],
    '🧃',
  ],

  // Proteins.
  [
    [
      'chicken', 'turkey', 'poultry', 'drumstick', 'nuggets', 'duck', 'wings',
      'пиле*', 'пилешк*', 'кокош*', 'пуйка', 'пуешк*', 'крилц*', 'кълки', 'патица',
      '*hähnchen*', '*haehnchen*', 'hühnchen', 'huhn', 'hühner*', 'pute', 'puten*', 'geflügel', 'ente',
      'pollo*', 'pavo', 'muslo', 'alitas', 'pechuga',
      'poulet*', 'dinde', 'cuisse', 'aiguillettes', 'canard',
    ],
    '🍗',
  ],
  [
    [
      'bacon', 'pancetta', 'lardon', 'lardons', 'prosciutto', 'salami', 'chorizo', 'pastrami', 'charcuterie',
      'бекон', 'салам', 'луканка', 'суджук', 'пастърма', 'прошуто', 'филе елена',
      'speck', 'schinkenspeck', 'salami',
      'beicon', 'panceta', 'tocino', 'jamón serrano', 'jamón ibérico', 'embutido*',
      'lard', 'jambon cru', 'saucisson',
    ],
    '🥓',
  ],
  [
    [
      'steak', 'beef', 'mince', 'brisket', 'lamb', 'pork', 'ham', 'gammon', 'ribs', 'sirloin', 'venison',
      'месо', 'телешк*', 'свинск*', 'агнешк*', 'кайма', 'пържола*', 'шунка', 'ребра', 'бифтек',
      'rind*', 'schwein*', 'lamm*', 'hackfleisch', 'hack', 'kotelett', 'schinken', 'fleisch',
      'carne', 'ternera', 'res', 'cerdo', 'cordero', 'jamón', 'filete', 'solomillo', 'costillas',
      'bœuf', 'boeuf', 'viande', 'porc', 'agneau', 'jambon', 'entrecôte', 'haché', 'hache',
    ],
    '🥩',
  ],
  [
    [
      'prawn', 'prawns', 'shrimp', 'scampi',
      'скарид*',
      'garnele*', 'shrimps',
      'gamba*', 'langostino*', 'camarón', 'camarones',
      'crevette*', 'gambas',
    ],
    '🍤',
  ],
  [['lobster', 'langoustine', 'омар', 'hummer', 'langosta', 'bogavante', 'homard', 'langouste'], '🦞'],
  [['crab', 'раци', 'рак', 'krabbe*', 'cangrejo*', 'crabe'], '🦀'],
  [
    [
      'oyster', 'oysters', 'mussels', 'clams', 'scallops',
      'стрид*', 'миди',
      'auster*', 'muschel*', 'jakobsmuschel*',
      'ostra*', 'mejillón', 'mejillones', 'almeja*', 'vieira*',
      'huître*', 'huitre*', 'moule*', 'palourde*', 'saint-jacques',
    ],
    '🦪',
  ],
  [
    [
      'squid', 'calamari', 'octopus',
      'калмар*', 'октопод',
      'tintenfisch', 'oktopus',
      'calamar*', 'pulpo', 'chipirones',
      'calmar*', 'poulpe', 'encornet',
    ],
    '🦑',
  ],
  [
    [
      'salmon', 'tuna', 'cod', 'haddock', 'fish', 'mackerel', 'sardine', 'sardines', 'trout', 'sea bass',
      'seabass', 'halibut', 'anchovy', 'anchovies',
      'риба', 'рибн*', 'сьомга', 'тон', 'скумрия', 'пъстърва', 'треска', 'ципура', 'лаврак', 'хамсия', 'цаца',
      '*fisch*', 'lachs', 'forelle', 'kabeljau', 'dorsch', 'hering', 'makrele', 'seelachs',
      'pescado', 'salmón', 'atún', 'bacalao', 'merluza', 'trucha', 'lubina', 'dorada', 'boquerones', 'caballa',
      'poisson', 'saumon', 'thon', 'cabillaud', 'morue', 'truite', 'dorade', 'maquereau', 'hareng', 'anchois',
    ],
    '🐟',
  ],
  [
    [
      'egg', 'eggs', 'boiled egg', 'poached egg',
      'яйц*', 'яйце',
      'ei', 'eier', 'eigelb', 'eiweiß',
      'huevo*', 'œuf*', 'oeuf*',
    ],
    '🥚',
  ],
  [
    [
      'tofu', 'tempeh', 'seitan', 'falafel', 'quorn',
      'тофу', 'фалафел', 'сейтан',
      'seitán',
    ],
    '🧆',
  ],
  [
    [
      'beans', 'lentils', 'chickpeas', 'hummus', 'houmous', 'edamame',
      'боб', 'фасул', 'леща', 'нахут', 'хумус',
      'bohnen', 'linsen', 'kichererbsen',
      'alubias', 'judías', 'judias', 'frijoles', 'lentejas', 'garbanzos',
      'haricots', 'lentilles', 'pois chiches', 'houmous',
    ],
    '🫘',
  ],

  // Carb bases. Pastries and the ones with their own picture sit above bread,
  // which would otherwise swallow "cinnamon roll" and "bagel".
  [
    [
      'croissant', 'pain au chocolat', 'pastry', 'danish', 'scone', 'cinnamon roll',
      'кроасан*', 'кифл*', 'щрудел с', 'канелена питка',
      'hörnchen', 'plunder', 'franzbrötchen', 'zimtschnecke*',
      'cruasán', 'bollo*', 'ensaimada', 'napolitana',
      'chocolatine', 'viennoiserie*',
    ],
    '🥐',
  ],
  [['bagel', 'bagels', 'багел*'], '🥯'],
  [['pretzel', 'pretzels', 'гевре*', 'brezel*', 'bretzel*'], '🥨'],
  [
    [
      'flatbread', 'tortilla', 'naan', 'pitta', 'pita', 'roti', 'chapati',
      'пита*', 'тортила', 'лаваш',
      'fladenbrot', 'pan plano',
    ],
    '🫓',
  ],
  [
    [
      'bread', 'toast', 'roll', 'sourdough', 'crumpet', 'english muffin', 'brioche', 'focaccia', 'ciabatta',
      'хляб*', 'хлебч*', 'филия*', 'препечен*', 'питка', 'кифла',
      // Spelled out rather than `*brot`, which would reach past the crackers and
      // the flatbread further down and claim Knäckebrot and Fladenbrot too.
      'brot', 'brötchen', 'broetchen', 'vollkornbrot', 'schwarzbrot', 'roggenbrot', 'weißbrot', 'toastbrot',
      'semmel', 'zwieback',
      'pan', 'pan integral', 'tostada*', 'barra de pan',
      'pain', 'pain complet', 'tartine*', 'biscotte*',
    ],
    '🍞',
  ],
  [
    [
      'rice', 'sushi rice', 'basmati', 'jasmine rice', 'couscous', 'quinoa', 'bulgur',
      'ориз*', 'булгур', 'кускус', 'киноа',
      'reis', 'milchreis',
      'arroz', 'riz',
    ],
    '🍚',
  ],
  [
    [
      'sweet potato', 'sweet potatoes', 'yam',
      'сладък картоф*', 'батат*',
      'süßkartoffel*', 'suesskartoffel*',
      'boniato*', 'camote*',
      'patate douce', 'patates douces',
    ],
    '🍠',
  ],
  [
    [
      'potato', 'potatoes', 'mash', 'jacket',
      'картоф*', 'пюре',
      '*kartoffel*', 'erdapfel', 'püree', 'kroketten',
      'patata*', 'papa', 'papas', 'puré',
      'purée',
    ],
    '🥔',
  ],
  [
    [
      'cracker', 'crackers', 'rice cake', 'rice cakes', 'oatcake', 'oatcakes',
      'крекер*', 'солети', 'оризовк*',
      'knäckebrot', 'reiswaffel*',
      'galleta salada', 'tortita de arroz',
      'galette de riz',
    ],
    '🍘',
  ],

  // Fruit and veg.
  [['avocado', 'guacamole', 'авокадо', 'aguacate', 'avocat'], '🥑'],
  [['banana', 'bananas', 'банан*', 'banane*', 'plátano*', 'platano*'], '🍌'],
  [['apple', 'apples', 'ябълк*', 'apfel', 'äpfel', 'apfelmus', 'manzana*', 'pomme', 'pommes'], '🍎'],
  [
    [
      'orange', 'oranges', 'clementine', 'satsuma', 'tangerine', 'mandarin',
      'портокал*', 'мандарин*',
      'mandarine*', 'clementine*', 'klementine*',
      'naranja*', 'mandarina*', 'clementina*',
      'clémentine*',
    ],
    '🍊',
  ],
  [['grapefruit', 'грейпфрут', 'pampelmuse', 'pomelo', 'pamplemousse'], '🍊'],
  [
    [
      'lemon', 'lemons', 'lime', 'limes',
      'лимон*', 'лайм',
      'zitrone*', 'limette*',
      'limón', 'limones', 'lima',
      'citron*',
    ],
    '🍋',
  ],
  [
    [
      'berries', 'strawberry', 'strawberries', 'raspberry', 'raspberries', 'blackberry', 'blackberries',
      'ягод*', 'малин*', 'къпин*', 'горски плодове',
      'erdbeere*', 'himbeere*', 'brombeere*', 'beeren',
      'fresa*', 'frambuesa*', 'mora', 'moras',
      'fraise*', 'framboise*', 'mûre*', 'mure*',
    ],
    '🍓',
  ],
  [['blueberry', 'blueberries', 'боровинк*', 'heidelbeere*', 'blaubeere*', 'arándano*', 'arandano*', 'myrtille*'], '🫐'],
  [
    [
      'grape', 'grapes', 'raisins', 'sultanas',
      'грозде', 'стафид*',
      'trauben', 'weintrauben', 'rosinen',
      'uva*', 'pasas',
      'raisin*',
    ],
    '🍇',
  ],
  [
    [
      'watermelon', 'melon', 'cantaloupe', 'honeydew',
      'диня', 'пъпеш',
      'melone*', 'wassermelone*',
      'sandía', 'sandia', 'melón',
      'pastèque', 'pasteque',
    ],
    '🍉',
  ],
  [
    [
      'peach', 'nectarine', 'apricot', 'plum', 'plums',
      'праскова', 'праскови', 'кайси*', 'слив*', 'нектарин*',
      'pfirsich*', 'aprikose*', 'pflaume*', 'zwetschge*',
      'melocotón', 'durazno', 'albaricoque*', 'ciruela*',
      'pêche*', 'peche*', 'abricot*', 'prune*',
    ],
    '🍑',
  ],
  [['pear', 'pears', 'круша', 'круши', 'birne*', 'pera', 'peras', 'poire*'], '🍐'],
  [['pineapple', 'ананас', 'piña', 'pina', 'ananá'], '🍍'],
  [['mango', 'манго', 'mangue', 'mangos'], '🥭'],
  [['kiwi', 'киви', 'kiwis'], '🥝'],
  [['cherry', 'cherries', 'череш*', 'вишн*', 'kirsche*', 'cereza*', 'cerise*'], '🍒'],
  [['coconut', 'кокос*', 'kokos*', 'coco', 'noix de coco'], '🥥'],
  [['olive', 'olives', 'маслин*', 'olive*', 'aceituna*', 'oliva*'], '🫒'],
  [['tomato', 'tomatoes', 'домат*', 'tomate*'], '🍅'],
  [
    [
      'broccoli', 'greens', 'spinach', 'kale', 'veg', 'vegetables', 'courgette', 'zucchini', 'asparagus',
      'green beans', 'sprouts',
      'броколи', 'спанак', 'зеленчуц*', 'тиквичк*', 'аспержи', 'зелен фасул',
      'brokkoli', 'spinat', 'gemüse', 'gemuese', 'spargel', 'rosenkohl',
      'brócoli', 'brocoli', 'espinaca*', 'verdura*', 'calabacín', 'calabacines', 'espárrago*',
      'épinard*', 'epinard*', 'légume*', 'legume*', 'asperge*',
    ],
    '🥦',
  ],
  [
    [
      'lettuce', 'cabbage', 'rocket', 'arugula', 'kimchi', 'pak choi', 'chard',
      'маруля', 'зеле', 'кисело зеле', 'рукола', 'манголд',
      'kohl', 'weißkohl', 'sauerkraut', 'rucola', 'chinakohl',
      'lechuga', 'col', 'repollo', 'chucrut', 'rúcula',
      'laitue', 'chou', 'choucroute', 'roquette',
    ],
    '🥬',
  ],
  [['carrot', 'carrots', 'морков*', 'karotte*', 'möhre*', 'moehre*', 'zanahoria*', 'carotte*'], '🥕'],
  [['corn', 'sweetcorn', 'царевиц*', 'mais', 'maíz', 'elote', 'choclo', 'maïs'], '🌽'],
  [
    [
      'mushroom', 'mushrooms',
      'гъб*',
      'pilz*', 'champignon*',
      'champiñón', 'champiñones', 'seta', 'setas', 'hongo*',
    ],
    '🍄',
  ],
  [
    [
      'cucumber', 'pickle', 'pickles', 'gherkin',
      'краставиц*', 'краставички', 'туршия',
      'gurke*', 'essiggurke*',
      'pepino*', 'pepinillo*', 'encurtido*',
      'concombre*', 'cornichon*',
    ],
    '🥒',
  ],
  [['bell pepper', 'peppers', 'capsicum', 'чушк*', 'пиперк*', 'paprika*', 'pimiento*', 'morrón', 'poivron*'], '🫑'],
  [
    [
      'chilli', 'chili', 'jalapeno', 'jalapenos', 'sriracha', 'hot sauce',
      'лют*', 'чили', 'халапеньо',
      'peperoni', 'jalapeño', 'scharfe sauce',
      'chile', 'guindilla', 'picante', 'salsa picante',
      'piment', 'sauce piquante', 'harissa',
    ],
    '🌶️',
  ],
  [['aubergine', 'eggplant', 'патладжан*', 'berenjena*'], '🍆'],
  [['garlic', 'чесън', 'knoblauch', 'ajo', 'ail'], '🧄'],
  [
    [
      'onion', 'onions', 'leek', 'leeks', 'shallot', 'shallots',
      'лук', 'праз', 'шалот',
      'zwiebel*', 'lauch', 'porree', 'schalotte*',
      'cebolla*', 'puerro*', 'chalota*',
      'oignon*', 'poireau*', 'échalote*',
    ],
    '🧅',
  ],
  [
    [
      'peas', 'mangetout', 'petit pois',
      'грах', 'зелен грах',
      'erbsen', 'zuckerschoten',
      'guisantes', 'arvejas', 'tirabeques',
      'petits pois', 'pois',
    ],
    '🫛',
  ],
  [['pumpkin', 'butternut', 'тикв*', 'kürbis*', 'kuerbis*', 'calabaza*', 'courge*', 'potiron*', 'citrouille*'], '🎃'],

  // Dairy.
  [
    [
      'cheese', 'cheddar', 'mozzarella', 'feta', 'parmesan', 'halloumi', 'brie', 'burrata', 'ricotta',
      'mascarpone',
      'сирене', 'кашкавал', 'извара', 'крема сирене', 'моцарела', 'пармезан',
      '*käse*', '*kaese*', 'gouda', 'camembert',
      'queso*', 'parmesano',
      'fromage*', 'comté', 'chèvre',
    ],
    '🧀',
  ],
  [
    [
      'yoghurt', 'yogurt', 'skyr', 'quark',
      'кисело мляко', 'йогурт*',
      'joghurt*',
      'yogur*', 'cuajada',
      'yaourt*', 'yoghourt',
    ],
    '🥛',
  ],
  [
    [
      'milk', 'latte', 'flat white', 'cappuccino', 'milkshake',
      'мляко', 'прясно мляко', 'лате', 'капучино', 'милкшейк',
      'milch', '*milch', 'milchkaffee',
      'leche', 'café con leche', 'batido*',
      'lait',
    ],
    '🥛',
  ],
  [
    [
      'peanut butter', 'almond butter', 'nut butter',
      'фъстъчено масло', 'тахан', 'бадемово масло',
      'erdnussbutter', 'nussmus',
      'mantequilla de cacahuete', 'crema de cacahuete',
      'beurre de cacahuète', 'beurre de cacahuete', "purée d'amande",
    ],
    '🥜',
  ],
  [
    [
      'butter', 'ghee', 'margarine',
      'масло', 'краве масло', 'маргарин',
      'mantequilla', 'manteca', 'margarina',
      'beurre',
    ],
    '🧈',
  ],

  // Snacks and sweets.
  [
    [
      'chocolate', 'choc', 'brownie', 'brownies', 'cocoa', 'nutella',
      'шоколад*', 'какао', 'брауни', 'нутела',
      'schokolade', 'schoko*', 'kakao',
      'cacao', 'chocolat*',
    ],
    '🍫',
  ],
  [
    [
      'biscuit', 'biscuits', 'cookie', 'cookies', 'digestive', 'digestives', 'oreo', 'oreos',
      'бисквит*', 'курабий*', 'сладки',
      'keks*', 'plätzchen', 'butterkeks',
      'galleta*',
      'sablé*', 'petit-beurre',
    ],
    '🍪',
  ],
  [
    [
      'cupcake', 'cupcakes', 'muffin', 'muffins',
      'мъфин*', 'кексче*',
      'magdalena*', 'madeleine*',
    ],
    '🧁',
  ],
  [
    [
      'cake', 'gateau', 'sponge', 'tiramisu',
      'торта', 'кекс', 'сладкиш', 'тирамису', 'пандишпан',
      'kuchen', 'torte*', 'biskuit',
      'tarta', 'pastel', 'bizcocho', 'tiramisú',
      'gâteau*', 'quatre-quarts',
    ],
    '🍰',
  ],
  [
    [
      'doughnut', 'donut', 'doughnuts', 'donuts',
      'поничк*',
      'krapfen', 'berliner',
      'dona', 'donas', 'rosquilla*',
      'beignet*',
    ],
    '🍩',
  ],
  // Iced drinks are named after the ice in Spanish and French, so they sit above
  // the ice cream they would otherwise be read as.
  [['té helado', 'te helado', 'thé glacé', 'the glace'], '🍵'],
  [['café helado', 'cafe helado', 'café glacé', 'cafe glace'], '☕'],
  [
    [
      'ice cream', 'gelato', 'sorbet', 'ice lolly', 'popsicle',
      'сладолед*',
      'eis', 'eiscreme',
      'helado*', 'sorbete*', 'polo',
      'glace*', 'crème glacée',
    ],
    '🍨',
  ],
  [
    [
      'custard', 'pudding', 'creme brulee', 'panna cotta', 'flan',
      'пудинг*', 'крем карамел', 'крем',
      'vanillesoße', 'vanillesosse',
      'natillas', 'crema catalana',
      'crème brûlée', 'crème caramel', 'crème dessert',
    ],
    '🍮',
  ],
  [['mochi', 'dango', 'моти'], '🍡'],
  [['lollipop', 'lolly', 'близалк*', 'lutscher*', 'piruleta*', 'sucette*'], '🍭'],
  [
    [
      'sweets', 'candy', 'haribo', 'gummy', 'marshmallow', 'jelly',
      'бонбон*', 'желирани', 'желе', 'маршмелоу',
      'süßigkeiten', 'suessigkeiten', 'gummibärchen', 'bonbon*', 'gelee',
      'caramelo*', 'chuches', 'chucherías', 'gominola*', 'malvavisco*',
      'gélifié*', 'guimauve',
    ],
    '🍬',
  ],
  [
    [
      'crisps', 'popcorn',
      'пуканк*',
      'pop-corn', 'palomitas',
    ],
    '🍿',
  ],
  [
    [
      'nuts', 'almonds', 'peanut', 'peanuts', 'cashew', 'cashews', 'walnut', 'walnuts', 'pistachio',
      'pistachios', 'pecan', 'pecans', 'seeds',
      'ядки', 'бадем*', 'орех*', 'лешник*', 'фъстъц*', 'фъстък', 'кашу', 'шамфъстък', 'семки', 'семена',
      'nüsse', 'nuesse', 'nuss', 'mandel*', 'walnuss*', 'haselnuss*', 'erdnuss*', 'pistazie*', 'kerne',
      'frutos secos', 'nueces', 'almendra*', 'avellana*', 'cacahuete*', 'cacahuate*', 'maní', 'anacardo*',
      'pistacho*', 'semillas', 'pipas',
      'noix', 'amande*', 'noisette*', 'cacahuète*', 'pistache*', 'graines',
    ],
    '🥜',
  ],
  [
    [
      'protein bar', 'protein shake', 'whey', 'shake',
      'протеин*', 'шейк*', 'суроватъчен',
      'proteinriegel', 'eiweißshake', 'eiweissshake',
      'batido de proteínas', 'barrita de proteínas', 'proteína*',
      'barre protéinée', 'protéine*',
    ],
    '🥤',
  ],

  // Drinks.
  [['bubble tea', 'boba', 'бабъл ти', 'боба'], '🧋'],
  [
    [
      'coffee', 'espresso', 'americano', 'mocha', 'cortado',
      'кафе', 'еспресо', 'американо', 'мока', 'нескафе',
      'kaffee', '*kaffee',
      'café', 'expreso',
      'allongé',
    ],
    '☕',
  ],
  [
    [
      'tea', 'chai', 'matcha',
      'чай*', 'айс ти', 'айс тий',
      'tee', '*tee',
      'té', 'infusión',
      'thé', 'tisane', 'infusion',
    ],
    '🍵',
  ],
  [
    [
      'beer', 'lager', 'ale', 'pint', 'cider', 'ipa',
      'бира', 'пиво', 'наливна',
      'bier', 'pils', 'radler',
      'cerveza', 'caña', 'birra', 'sidra',
      'bière', 'biere', 'cidre',
    ],
    '🍺',
  ],
  [['champagne', 'шампанско', 'champagner', 'sekt', 'champán', 'champan', 'cava', 'crémant'], '🍾'],
  [
    [
      'wine', 'prosecco', 'merlot', 'rioja', 'malbec', 'sauvignon',
      'вино', 'вина', 'просеко',
      'wein', 'weißwein', 'weisswein', 'rotwein',
      'vino',
      'vin',
    ],
    '🍷',
  ],
  [['sake', 'soju', 'саке'], '🍶'],
  [
    [
      'cocktail', 'gin', 'vodka', 'whisky', 'whiskey', 'rum', 'tequila', 'mojito', 'margarita', 'negroni',
      'aperol',
      'коктейл*', 'джин', 'водка', 'уиски', 'ром', 'текила', 'ракия', 'мастика', 'мохито',
      'wodka', 'schnaps',
      'cóctel', 'ginebra', 'ron',
      'rhum',
    ],
    '🍸',
  ],
  [
    [
      'coke', 'cola', 'soda', 'lemonade', 'fizzy', 'pepsi', 'sprite', 'energy drink', 'red bull',
      'кола', 'газирана', 'лимонада', 'енергийна напитка',
      'limonade', 'brause', 'energydrink', 'spezi',
      'refresco', 'gaseosa', 'bebida energética',
      'boisson énergisante',
    ],
    '🥤',
  ],
  [['water', 'вода', 'минерална вода', 'wasser', '*wasser', 'sprudel', 'agua', 'eau'], '💧'],

  // Store cupboard — rarely the whole entry, so they sit last.
  [
    [
      'honey', 'syrup', 'jam', 'marmalade', 'maple',
      'мед', 'сироп', 'конфитюр', 'сладко', 'мармалад',
      'honig', 'sirup', 'marmelade', 'konfitüre', 'ahornsirup',
      'miel', 'sirope', 'jarabe', 'mermelada',
      'sirop', 'confiture',
    ],
    '🍯',
  ],
  [
    [
      'salt', 'seasoning', 'spices',
      'сол', 'подправк*', 'пипер',
      'salz', 'gewürz*', 'pfeffer',
      'sal', 'especias', 'pimienta',
      'sel', 'épices', 'poivre',
    ],
    '🧂',
  ],
  [
    [
      'herbs', 'basil', 'coriander', 'parsley', 'mint', 'thyme',
      'билк*', 'босилек', 'магданоз', 'мента', 'джоджен', 'кориандър', 'копър',
      'kräuter', 'kraeuter', 'basilikum', 'petersilie', 'minze', 'thymian',
      'hierbas', 'albahaca', 'perejil', 'menta', 'cilantro', 'tomillo',
      'herbes', 'basilic', 'persil', 'menthe', 'coriandre', 'thym',
    ],
    '🌿',
  ],
  [['ginger', 'джинджифил', 'ingwer', 'jengibre', 'gingembre'], '🫚'],
  [
    [
      'takeaway', 'takeout', 'leftovers',
      'доставка', 'за вкъщи', 'остатъци',
      'lieferung', 'zum mitnehmen', 'reste',
      'para llevar', 'sobras',
      'à emporter', 'restes', 'livraison',
    ],
    '🥡',
  ],
];

const PATTERNS: [RegExp, string][] = TABLE.map(([terms, emoji]) => [compile(terms), emoji]);

const MEAL_FALLBACK: Record<Meal, string> = {
  breakfast: '🍳',
  lunch: '🥪',
  dinner: '🍽️',
  snack: '🍪',
};

/** A picture for a logged meal. Never empty — falls back on the meal itself. */
export function foodEmoji(description: string, meal?: Meal | string): string {
  const text = description.toLowerCase();
  for (const [pattern, emoji] of PATTERNS) {
    if (pattern.test(text)) return emoji;
  }
  return MEAL_FALLBACK[meal as Meal] ?? '🍽️';
}

/**
 * The same idea for exercise, which has a far smaller vocabulary and so gets a
 * far shorter table — in the same five languages, for the same reason.
 */
const EXERCISE_TABLE: [string[], string][] = [
  [
    [
      'run', 'running', 'ran', 'jog', 'jogging', '5k', '10k', 'marathon', 'parkrun', 'park run',
      'бягане', 'бягах', 'тичане', 'крос', 'маратон',
      'laufen', 'joggen', 'lauf', 'gelaufen',
      'correr', 'carrera', 'trote', 'maratón',
      'courir', 'course à pied', 'jogging',
    ],
    '🏃',
  ],
  [
    [
      'walk', 'walking', 'walked', 'steps', 'hike', 'hiking', 'ramble',
      'ходене', 'разходка', 'стъпки', 'пеша', 'поход',
      'gehen', 'spazieren', 'spaziergang', 'schritte', 'wandern', 'wanderung',
      'caminar', 'caminata', 'pasos', 'andar', 'senderismo',
      'marche', 'marcher', 'randonnée', 'randonnee',
    ],
    '🚶',
  ],
  [
    [
      'cycle', 'cycling', 'bike', 'biking', 'ride', 'spin', 'peloton',
      'колело', 'велосипед', 'колоездене', 'спининг',
      'radfahren', 'fahrrad', 'rad', 'spinning',
      'bici', 'bicicleta', 'ciclismo',
      'vélo', 'velo', 'cyclisme',
    ],
    '🚴',
  ],
  [
    [
      'swim', 'swimming', 'swam', 'pool', 'lengths',
      'плуване', 'плувах', 'басейн', 'дължини',
      'schwimmen', 'schwimmbad', 'bahnen',
      'nadar', 'natación', 'piscina', 'largos',
      'nager', 'natation', 'piscine', 'longueurs',
    ],
    '🏊',
  ],
  [
    [
      'gym', 'weight', 'weights', 'weight training', 'lifting', 'deadlift', 'squat', 'bench', 'strength', 'reps',
      'фитнес', 'тежести', 'клек', 'лег', 'набирания', 'повторения', 'силова',
      'fitnessstudio', 'gewichte', 'krafttraining', 'kniebeugen', 'kreuzheben', 'bankdrücken', 'wiederholungen',
      'gimnasio', 'pesas', 'fuerza', 'sentadillas', 'peso muerto', 'press banca', 'repeticiones',
      'musculation', 'salle de sport', 'poids', 'squats', 'soulevé de terre', 'répétitions',
    ],
    '🏋️',
  ],
  [
    [
      'yoga', 'pilates', 'stretch', 'stretching', 'mobility',
      'йога', 'пилатес', 'разтягане', 'стречинг',
      'dehnen', 'dehnung',
      'estiramientos',
      'étirements', 'etirements', 'souplesse',
    ],
    '🧘',
  ],
  [['football', 'soccer', 'match', 'футбол', 'fußball', 'fussball', 'fútbol', 'futbol', 'foot'], '⚽'],
  [
    [
      'tennis', 'padel', 'squash', 'badminton',
      'тенис', 'падел', 'скуош', 'бадминтон',
      'pádel', 'bádminton',
    ],
    '🎾',
  ],
  [['basketball', 'баскетбол', 'baloncesto', 'básquet', 'basket'], '🏀'],
  [
    [
      'climb', 'climbing', 'bouldering',
      'катерене', 'боулдъринг',
      'klettern', 'bouldern',
      'escalada', 'escalar',
      'escalade', 'grimpe',
    ],
    '🧗',
  ],
  [['row', 'rowing', 'erg', 'гребане', 'rudern', 'rudergerät', 'remo', 'remar', 'rameur', 'aviron'], '🚣'],
  [['dance', 'dancing', 'zumba', 'танц*', 'зумба', 'tanzen', 'tanz', 'bailar', 'baile', 'danse', 'danser'], '💃'],
  [
    [
      'hiit', 'circuit', 'crossfit', 'bootcamp', 'workout',
      'тренировка', 'кардио', 'кръгова',
      'training', 'zirkeltraining',
      'entrenamiento', 'circuito',
      'entraînement', 'entrainement',
    ],
    '🤸',
  ],
  [['ski', 'skiing', 'snowboard', 'ски', 'сноуборд', 'skifahren', 'esquí', 'esquiar'], '⛷️'],
  [
    [
      'box', 'boxing', 'martial', 'karate', 'judo',
      'бокс', 'карате', 'джудо', 'бойни',
      'boxen', 'kampfsport',
      'boxeo',
      'boxe', 'karaté',
    ],
    '🥊',
  ],
];

const EXERCISE_PATTERNS: [RegExp, string][] = EXERCISE_TABLE.map(([terms, emoji]) => [compile(terms), emoji]);

/** A picture for a logged burn. Falls back to a generic bit of movement. */
export function exerciseEmoji(description: string): string {
  const text = description.toLowerCase();
  for (const [pattern, emoji] of EXERCISE_PATTERNS) {
    if (pattern.test(text)) return emoji;
  }
  return '🏃';
}
