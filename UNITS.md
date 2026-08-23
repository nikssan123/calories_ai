# Measurement systems

Someone in Ohio does not think in kilograms, and an app that makes them convert
their own weigh-in before they can log it has already lost them. This is how the
journal speaks pounds, ounces, feet and miles to the people who read them, and
metric to everyone else, without ever storing two versions of a number.

## The one rule

**Storage is metric. Always. Everywhere.**

`weight_kg`, `height_cm`, `quantity_g`, `distance_km`, `kcal_100g` — every column
keeps the unit in its name and that unit never changes. Conversion happens at the
two edges only: on the way onto a screen, and on the way off a keyboard.

This is not a stylistic preference. A database that stores "175" in a column whose
unit depends on a *different* row is one where every query is wrong until it joins
the user table, every aggregate across users is meaningless, and the day somebody
switches from imperial to metric their whole history changes weight. The
preference is a lens, not a fact about the food.

`users.units` is `'metric' | 'imperial'`, nullable. Null means **never asked** —
a brand-new account before onboarding has got to it. Everything reads it through
`unitsOf(profile)`, which resolves null to metric, so null is never a special
case anywhere but the onboarding prompt.

## What actually converts

| Quantity | Metric | Imperial | Where |
|---|---|---|---|
| Body weight | kg | lb | progress, today, history, chat weight card, weigh-in input, weekly email |
| Height | cm | ft ′ in ″ | setup |
| Target weight | kg | lb | setup, progress |
| Food portions | g | oz, then lb past a pound | today, plan, recipes, barcode |
| Distance | km | mi | exercise, chat exercise card |
| Barbell load | kg | lb | workout card, chat workout card |
| Barcode basis | per 100 g | per 1 oz | scanner, web and mobile |
| Cards the server draws | g, kg | oz, lb | food card quantities, weight trend, scan portion |

## What deliberately does not

**Macros stay in grams.** Protein, carbs, fat, fiber, sugar and saturated fat are
printed in grams on an American nutrition label exactly as they are on a European
one — it is federal law, not a European habit. "24 g protein" is not a metric
figure that needs translating; it is *the* figure. Converting it to 0.85 oz would
make the app harder to read for the very people it was meant to help. Sodium stays
in mg for the same reason.

**Calories stay calories.** `kcal` is the unit in the typography, the ring, the
target and the API. The US label word is "Calories", which is the same number; the
only thing changing it would buy is a rename across every surface in the product.

**The landing page stays metric.** Nobody has signed in yet, so there is no
preference to read. It is marketing copy, not somebody's data.

## Rounding

Both systems get the same precision, so switching never looks like a measurement
changed:

- Body weight and target weight: one decimal (`72.4 kg` / `159.6 lb`).
- Distance: one decimal, trailing `.0` trimmed (`5 km` / `3.1 mi`).
- Barbell load: one decimal, trimmed — microplates are real (`82.5 lb`).
- Height, imperial: whole inches (`5′10″`). A half-inch on a height nobody
  measured to the half-inch is false precision.
- Portions: whole grams; ounces to one decimal, trimmed; at a pound and above,
  pounds to one decimal. `7 oz` of chicken, `1.5 lb` of mince.

## Onboarding

The journal asks. It is one clause inside the question it already asks about
height and weight — *"how tall are you, and roughly what do you weigh? (kg and cm,
or feet and pounds — whichever you think in)"* — and if they answer `5'10", 180 lb`
the agent sets it from the answer rather than asking a question it can already see
the answer to.

It is asked rather than inferred from the browser locale because a locale is a
guess about a person, and the two populations it gets wrong — expats, and anyone
whose laptop shipped with the wrong region — are exactly the people who would then
have to go and find the setting. One short question beats a silent wrong default.

Afterwards it lives on the setup screen like every other preference, and changing
it re-renders history rather than rewriting it.

## The cards

The one place the *server* writes a display string rather than a number.

Every figure on a chat card is put there by the server — that is the rule that
stops a model drawing a weight loss that did not happen — so the server is also
the one that has to convert it. Three of them carry a unit:

- **A food card's item line**, when the model gave no `quantity_desc` of its own.
  The fallback is `formatMass(quantity_g)`, not a bare `${g}g`.
- **The weight trend** from `show_chart`. The average is printed next to the
  line, so both it and the series are converted; the shape survives either way.
- **A scanned portion** — the `quantity_desc` on the entry and the sentence the
  journal writes about it, both from `portionPhrase`.

`ToolContext.units` and `UserContext.units` carry the preference to them. Tool
*arguments* are untouched by this: they are metric whatever the card says.

## The agent

The model is told what the person reads and told, in the same breath, that **tool
arguments never change**:

> Units: this person reads imperial. Write every measurement to them in pounds,
> ounces, feet and inches, miles and °F. Tool arguments are always metric — kg,
> cm, km, grams — whatever units the conversation is in. Convert.

That line rides on the per-turn "Where things stand" block, not the system prompt,
because the system prompt is byte-identical across requests on purpose and a
per-user byte in it would cost the prompt cache. It is emitted only for imperial
users: metric is what the tools already do, so saying so costs tokens and buys
nothing.

The same brief goes to the review writer, the recipe writer and the fridge scan,
which are separate agent sessions producing text full of numbers — a recipe that
says "brown 500 g of mince at 180 °C" is not a recipe an American can cook from,
and a kitchen list that says "500 g mince" is not one they can shop from. All
three have a byte-stable system prompt, so the brief rides their task turn.

## The barcode scanner

The interesting one, because the *data* has a nationality.

Open Food Facts and USDA FoodData Central both normalise to per-100 g, and the
cache stores that. What differs is what a label's reader expects to see. The
scanner's three portion pills become:

- **the serving** — unchanged, and this is what a US label leads with anyway
- **100 g → 1 oz** — the basis pill, in the unit the person's deli counter uses
- **Weigh it** — a stepper in grams or in ounces, half-ounce steps

All three still resolve to grams before the request leaves the browser, so
`POST /barcode/log` never learns that any of this happened.
