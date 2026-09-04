# Long-form posts

Build-in-public drafts. CONTENT_ENGINE.md §5 ranks this format second and it
costs nothing to produce — a talking head or a screen recording with voiceover,
and it works on TikTok, r/SideProject, r/loseit and X without changing a word.

The rule is the same one §0 applies to images: nothing here is a claim the code
does not support. Every technical detail below is cited to the file it came
from, so a reader who calls it can be answered with a line number rather than
an adjective.

---

## 1. "My app is in English. I write to it in Bulgarian."

**Source:** `apps/api/src/ai/language.ts`, `apps/api/src/ai/prompt.ts:365`.
**Angle:** a real bug, a real fix, and a feature nobody else advertises.
**Format:** talking head, or screen recording of a Bulgarian log + reply.

> My calorie app's interface is in English. I log my food in Bulgarian,
> because that is the language I think about food in.
>
> For a while it answered me in English translated word for word. "Barely a
> dent" came back as "барели дупка" — which is not Bulgarian. That is the
> English word spelled in Cyrillic.
>
> The bug was not the translation. It was that the app decided what language to
> *write* in by reading the setting for what language the *buttons* are in.
> Those are two different questions, and plenty of people read an English
> interface and keep their diary in their own language.
>
> So now the conversation decides and the setting is only the fallback — for a
> photo with no caption, or a notification written before you have said
> anything.
>
> Then the second problem. About 70% of turns run on a cheap fast model,
> because turning "two eggs and toast" into numbers is extraction, not
> reasoning. That holds in every language. The *writing* does not. In Bulgarian
> the same model produced "безхарно" and "четирист" — confident, fluent, not
> words.
>
> So I measured it: one meal log and one four-sentence answer in 34 languages.
> 24 came back clean. 10 did not, and those get routed to a better model for
> the reply. Eight of the ten I re-tested came back clean there.
>
> The split is not the alphabet. Russian and Greek are fine; Croatian is not.
> It is how much of each language the model has actually seen.
>
> Any language nobody has checked yet gets the expensive model until somebody
> checks it. That seemed like the right default for a diary.

**Cut-downs.** The first three paragraphs stand alone as a 20-second video —
"барели дупка" is the whole hook. The measurement half is a second post.

**Do not add:** a user count, a download number, or any suggestion that people
are already logging in 34 languages. One person logs in this app today and it
is the person writing the post. The languages are tested, not populated.
