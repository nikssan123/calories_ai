# App Review — Guideline 2.1 information request

Apple's first submission of 1.0 came back as **2.1.0 Performance: App Completeness**,
which for a developer account with no review history is a questionnaire rather than a
defect report: nothing in the app was found broken, and all eight in-app purchase and
subscription items were accepted and still sit at *Ready for Review*.

The seven answers below go in **two** places, because Apple asks for both:

1. As a reply in App Store Connect → App Review → the rejected submission → *Reply to App Review*.
2. Pasted into **App Review Information → Notes**, where they are kept for future submissions.

Item 1 of Apple's list is a screen recording and cannot be written down — see
*What the recording has to show* at the end.

---

## 2. Purpose and target audience

Day So Far is a food diary for people who have abandoned calorie counting because of the
data entry. Every other tracker asks you to find your meal in a database: search "chicken
rice", pick between forty near-identical rows, set a portion size in grams. That is thirty
seconds a meal, ninety seconds a day, and it is the reason most people stop within a week.

Day So Far takes a sentence. You type "grilled chicken with rice and salad" and the meal is
logged with calories and macros. Correcting it is also a sentence — "there was more rice,
about 300g" — and the entry you already logged changes, rather than a second entry appearing
underneath it.

The audience is people who want to know roughly what they ate without it becoming an
administrative task: users losing or maintaining weight, and users tracking protein for
training. It is a general wellness product. It does not diagnose, treat, or prevent any
condition, and it is declared not a regulated medical device.

## 3. Setting up and accessing the main features

A demo account is configured in App Review Information. It is email-verified, has completed
onboarding, carries three days of meal history and a three-week weight trend, and has 25
photo-scan credits loaded so the camera path can be exercised without a purchase.

To see the core feature, open the **Journal** tab and type a meal in plain language — for
example "two eggs on toast and a black coffee". The meal is parsed and appears in the day
immediately. Then type "actually there were three eggs" and the same entry updates.

- **Today** — the day's ring, macros, and a diet-quality breakdown.
- **Progress** — weight, calories and protein over thirty days.
- **Exercise** — workouts logged the same way, counted against the day.
- **Cook** — recipes ranked by what the account already has. Paid tier.
- **You** — profile, plan, data export, and account deletion.

The account is deliberately left on the **free** plan so the paywall is reachable and the
purchase flow can be tested with a sandbox account.

## 4. External services used to deliver core functionality

| Service | Purpose |
| --- | --- |
| Anthropic (Claude) | Parses meal descriptions and photos into food items with calories and macros |
| Open Food Facts | Packaged-product data for barcode scanning (ODbL; attributed in-app) |
| USDA FoodData Central | Nutrition reference data and the public-domain recipe set |
| RevenueCat | Subscription and purchase state; receipt validation |
| Apple In-App Purchase | All payment processing on iOS. No other payment path exists in the app |
| Google Sign-In (OAuth) | Optional sign-in method alongside email and password |
| Expo Push + Apple APNs | Delivery of the notifications a user opts into |
| Resend | Transactional email — verification, password reset, new-device alerts |
| Cloudflare R2 | Storage for meal photos the user takes |
| Self-hosted PostgreSQL | The user's journal, on infrastructure operated by the developer |

There is no advertising SDK, no analytics SDK, and no tracking across apps or websites, which
is what the App Privacy declaration states.

## 5. Regional differences

There are none. Every feature, every price tier and all content behave identically in all 175
regions where the app is available. The interface is localised into English, Bulgarian, German,
Spanish and French, and the journal understands meals written in any of them, but no feature is
added, removed or altered by region.

## 6. Regulated industry and third-party material

The app is not in a regulated industry. It is a general wellness food diary; it makes no medical
claim, gives no medical advice, and is declared not a regulated medical device in any region.

Two third-party data sets are used, both under terms that permit it:

- **Open Food Facts** — Open Database License. Attributed in the app wherever its data is shown
  ("Data from Open Food Facts").
- **USDA FoodData Central** — United States federal government work, public domain. Attributed
  as "Data from USDA FoodData Central".

No other protected material is included.

## 7. What In-App Purchase buys, and how to reach it

Reach the purchase screen from **You → the plan row**, or from any locked feature — for example
opening the **Cook** tab on the free plan.

**Subscriptions** (auto-renewing, one active at a time within the "Day So Far membership" group):

| Product | Length | What it opens |
| --- | --- | --- |
| Plus Monthly | 1 month | 90 AI messages and 8 photo scans a month, weekly reviews |
| Plus Annual | 1 year | The same, billed yearly |
| Coach Monthly | 1 month | 180 messages, 25 photo scans, plus the Cook tab — pantry scanning, recipes and meal plans |
| Coach Annual | 1 year | The same, billed yearly |

**Consumables** (bought outright, never expire, spent only after the plan's own scans are used):

| Product | What it buys |
| --- | --- |
| Photo pack 10 | 10 photo scans |
| Photo pack 25 | 25 photo scans |
| Photo pack 50 | 50 photo scans |

The purchase screen shows each product's title, length and price, a monthly equivalent for the
annual options, and links to the Terms of Use and the privacy policy. **Restore** is on the same
screen. Cancellation is handled by the store account, and the app links out to it rather than
claiming to cancel on Apple's behalf.

The free plan is not a trial and does not expire: logging meals, the daily ring, history and the
offline diary keep working without ever paying.

---

## What the recording has to show

Apple requires it **captured on a physical device on the latest OS**, beginning with the app
launching. A simulator capture invites another round. Install the new build from TestFlight and
record this order:

1. **Launch** from the home screen.
2. **Register** a new account — Apple asks to see registration, not only sign-in.
3. **Log a meal** by typing a sentence, then **correct it** with a second sentence.
4. **Today**, **Progress** and **Exercise**, briefly.
5. **Open the paywall** from a locked feature. Hold on it long enough to read the title, length
   and price of each subscription, and **tap through to the Terms and the privacy policy** so both
   links are visibly working.
6. **Buy something** with a sandbox account — a photo pack is the quickest.
7. **Delete the account** from You. Apple treats a missing deletion flow as its own rejection, so
   this must be on the recording even though it ends the session.

Points 5 and 7 are the ones a recording usually misses, and both are explicitly named in Apple's
message.
