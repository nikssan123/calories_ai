import { type Locale, localeOf, MIN_AGE, type Profile, underMinAge } from '@ct/shared';
import { query, queryOne } from '../db.ts';

/**
 * Whether this account belongs to somebody too young for the app.
 *
 * Either half is enough. The birth date is what the form was given; the stated
 * age is what they later told the journal, and is the one to believe when the
 * two disagree — nobody says "I'm 9" to a calorie tracker by accident.
 */
export async function isUnderAge(profile: Pick<Profile, 'id' | 'birth_date'>): Promise<boolean> {
  if (underMinAge(profile.birth_date)) return true;
  const row = await queryOne<{ stated_age: number | null }>(
    'SELECT stated_age FROM users WHERE id = $1',
    [profile.id],
  );
  return row?.stated_age != null && row.stated_age < MIN_AGE;
}

/** Records an age they said out loud. Only called for one under `MIN_AGE`. */
export async function recordStatedAge(userId: string, age: number): Promise<void> {
  await query(
    `UPDATE users SET stated_age = $2, stated_age_at = now(), updated_at = now() WHERE id = $1`,
    [userId, age],
  );
}

/**
 * The whole of the journal's side of a conversation with a child, once it knows.
 *
 * Written, not generated. A model given a rule about not coaching children will
 * follow it most of the time, and "most of the time" is the wrong standard for
 * a nine-year-old asking how many kilos lentils burn off — so after the turn
 * that learns their age, no model is asked anything. It says what the app is,
 * points at a grown-up, and does not scold: they were honest, which is the
 * behaviour to leave them with.
 */
const UNDER_AGE_REPLY: Record<Locale, string> = {
  en: "Day So Far is made for people 16 and over, so I can't help with food or weight here. If you have questions about eating, a parent or your doctor is the best person to ask. Thanks for telling me. 💛",
  bg: 'Day So Far е приложение за хора от 16 години нагоре, затова тук не мога да ти помагам с храненето и килограмите. Ако имаш въпроси за храната, най-добре питай мама, татко или личния си лекар. Благодаря, че ми каза. 💛',
  de: 'Day So Far ist für Menschen ab 16 gemacht, deshalb kann ich dir hier bei Essen und Gewicht nicht helfen. Wenn du Fragen zum Essen hast, fragst du am besten deine Eltern oder deinen Arzt. Danke, dass du es mir gesagt hast. 💛',
  es: 'Day So Far está hecho para personas de 16 años o más, así que aquí no puedo ayudarte con la comida ni el peso. Si tienes preguntas sobre lo que comes, lo mejor es preguntar a tu madre, a tu padre o a tu médico. Gracias por contármelo. 💛',
  fr: 'Day So Far est fait pour les personnes de 16 ans et plus, donc je ne peux pas t’aider ici avec la nourriture ou le poids. Si tu as des questions sur ce que tu manges, le mieux est d’en parler à tes parents ou à ton médecin. Merci de me l’avoir dit. 💛',
  ro: 'Day So Far e făcut pentru persoane de 16 ani sau mai mult, așa că aici nu te pot ajuta cu mâncarea sau greutatea. Dacă ai întrebări despre ce mănânci, cel mai bine întreabă-i pe părinți sau pe medicul tău. Mulțumesc că mi-ai spus. 💛',
  uk: 'Day So Far створено для людей від 16 років, тому тут я не можу допомагати з їжею чи вагою. Якщо маєш питання про харчування, найкраще запитати маму, тата або свого лікаря. Дякую, що сказав(ла) мені. 💛',
  sr: 'Day So Far је направљен за особе од 16 година и старије, па ти овде не могу помоћи око хране и тежине. Ако имаш питања о исхрани, најбоље је да питаш маму, тату или свог лекара. Хвала што си ми рекао/рекла. 💛',
  hr: 'Day So Far je napravljen za osobe od 16 godina i starije, pa ti ovdje ne mogu pomoći oko hrane i težine. Ako imaš pitanja o prehrani, najbolje je pitati mamu, tatu ili svog liječnika. Hvala što si mi rekao/rekla. 💛',
  cs: 'Day So Far je určený pro lidi od 16 let, takže ti tady s jídlem ani váhou pomoct nemůžu. Jestli máš otázky ohledně jídla, nejlepší je zeptat se rodičů nebo svého lékaře. Díky, že jsi mi to řekl/a. 💛',
  hu: 'A Day So Far 16 éves kortól használható, ezért itt nem tudok segíteni az evéssel vagy a testsúllyal kapcsolatban. Ha kérdésed van az étkezésről, a legjobb, ha a szüleidet vagy az orvosodat kérdezed. Köszönöm, hogy elmondtad. 💛',
  el: 'Το Day So Far είναι φτιαγμένο για άτομα 16 ετών και πάνω, οπότε εδώ δεν μπορώ να σε βοηθήσω με το φαγητό ή το βάρος. Αν έχεις ερωτήσεις για το φαγητό, καλύτερα να ρωτήσεις τους γονείς σου ή τον γιατρό σου. Ευχαριστώ που μου το είπες. 💛',
  sk: 'Day So Far je určený pre ľudí od 16 rokov, takže ti tu s jedlom ani váhou pomôcť nemôžem. Ak máš otázky o jedle, najlepšie je opýtať sa rodičov alebo svojho lekára. Ďakujem, že si mi to povedal/a. 💛',
};

export function underAgeReply(profile: Pick<Profile, 'locale'>, spoken?: Locale | null): string {
  return UNDER_AGE_REPLY[localeOf({ locale: profile.locale ?? spoken })];
}
