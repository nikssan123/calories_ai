-- Two axes of identity for an exercise, and fourteen rows that need neither.
--
-- The catalogue carries five emoji across two hundred and twenty exercises, so
-- 🏋️ is a statement about the category and every barbell lift wears it. The
-- picker is a wall of identical glyphs, and there is no emoji for a Romanian
-- deadlift to fix it with.
--
-- The muscle map (GYM-CARD.md §1) solves most of that in the client for free,
-- because `muscles` is already on the row. What it cannot say is what you pick
-- up — and "Barbell curl" versus "Cable curl" versus "Preacher curl" is exactly
-- the distinction somebody is trying to draw. That is §2, and it is this
-- column.
--
-- Then §3, which is a different problem: plenty of people know they trained
-- biceps and do not know what the machine was called. Today the picker has no
-- answer for them, and an abandoned session is worse than a vague one — a vague
-- one still carries the muscle, the burn and the volume.

-- ---- 1. Equipment -----------------------------------------------------------

-- Stored rather than read out of the name. A pattern that finds "machine" in
-- "Machine row" also finds it in "Smith machine squat" and then misses "Hack
-- squat" entirely, and the failure is silent: a wrong glyph looks exactly like
-- a right one, so nobody ever reports it.
--
-- Nullable, and null is the ordinary state for most of the table. A sport has
-- no equipment, a yoga class has none worth naming, and an exercise somebody
-- invents in the picker is asked for a name and nothing else — `defineExercise`
-- exists precisely so that somebody who could not find theirs is not then
-- interrogated about it.
ALTER TABLE exercise_types ADD COLUMN equipment TEXT
  CHECK (equipment IN ('barbell','dumbbell','cable','machine','bodyweight','kettlebell','other'));

-- Every built-in strength row gets one. The seven statements below are
-- exhaustive over the 132 of them and disjoint, which is checked by the test
-- suite rather than asserted here.

-- Barbell. A bar you load. The EZ-bar movements are here too — preacher and reverse
-- curls are a bar in the hands, whatever its shape.
UPDATE exercise_types SET equipment = 'barbell' WHERE user_id IS NULL AND name IN (
    'Barbell curl', 'Barbell row', 'Barbell shrug', 'Bench press', 'Box squat',
    'Clean and press', 'Close-grip bench press', 'Deadlift', 'Decline bench press',
    'Front squat', 'Good morning', 'Hip thrust', 'Incline bench press', 'Landmine press',
    'Overhead press', 'Pendlay row', 'Power clean', 'Preacher curl', 'Push press', 'Rack pull',
    'Reverse curl', 'Romanian deadlift', 'Skull crusher', 'Snatch', 'Squat',
    'Stiff-leg deadlift', 'Sumo deadlift', 'T-bar row', 'Thruster', 'Upright row'
);

-- Dumbbell. Two of them, or one held in both hands. Generic names inherited from the
-- original twenty-five ("Bicep curl", "Chest fly") land here because that is
-- what most people picture.
UPDATE exercise_types SET equipment = 'dumbbell' WHERE user_id IS NULL AND name IN (
    'Arnold press', 'Bicep curl', 'Bulgarian split squat', 'Chest fly', 'Chest-supported row',
    'Concentration curl', 'Dumbbell bench press', 'Dumbbell row', 'Dumbbell shoulder press',
    'Dumbbell shrug', 'Farmer''s walk', 'Front raise', 'Hammer curl', 'Incline dumbbell curl',
    'Incline dumbbell press', 'Lateral raise', 'Rear delt fly', 'Reverse wrist curl',
    'Single-leg Romanian deadlift', 'Split squat', 'Sumo squat', 'Tricep kickback',
    'Wrist curl'
);

-- Cable. A stack and a handle. Kept apart from `machine` because the choice between
-- a cable curl and a machine curl is one people actually make.
UPDATE exercise_types SET equipment = 'cable' WHERE user_id IS NULL AND name IN (
    'Cable crossover', 'Cable crunch', 'Cable curl', 'Cable kickback', 'Cable lateral raise',
    'Face pull', 'Lat pulldown', 'Overhead tricep extension', 'Seated row',
    'Straight-arm pulldown', 'Tricep extension', 'Tricep pushdown', 'Woodchopper'
);

-- Machine. Fixed path, usually a seat. The distinguishing feature is that the weight
-- is chosen by a pin rather than lifted onto a bar.
UPDATE exercise_types SET equipment = 'machine' WHERE user_id IS NULL AND name IN (
    'Hack squat', 'Hip abduction', 'Hip adduction', 'Leg curl', 'Leg extension', 'Leg press',
    'Machine chest press', 'Machine row', 'Machine shoulder press', 'Pec deck',
    'Reverse hyperextension', 'Seated calf raise', 'Seated leg curl', 'Smith machine squat',
    'Standing calf raise'
);

-- Kettlebell. Three of them, and worth their own glyph because the handle is the whole
-- reason the movement is different.
UPDATE exercise_types SET equipment = 'kettlebell' WHERE user_id IS NULL AND name IN (
    'Goblet squat', 'Kettlebell swing', 'Turkish get-up'
);

-- Bodyweight. The default for everything left, and by far the largest group. Note that a
-- weighted pull-up is still `bodyweight`: this names the apparatus, not the
-- load, and a dip belt does not turn a dip into a machine.
UPDATE exercise_types SET equipment = 'bodyweight' WHERE user_id IS NULL AND name IN (
    'Back extension', 'Bench dip', 'Bicycle crunch', 'Bird dog', 'Box jump', 'Burpee',
    'Calf raise', 'Chin-up', 'Copenhagen plank', 'Cossack squat', 'Crunch', 'Curtsy lunge',
    'Dead bug', 'Dead hang', 'Decline push-up', 'Diamond push-up', 'Dip', 'Flutter kicks',
    'Glute bridge', 'Glute-ham raise', 'Handstand push-up', 'Hanging leg raise', 'Hollow hold',
    'Incline push-up', 'Inverted row', 'Leg raise', 'Lunge', 'Mountain climbers',
    'Nordic curl', 'Pistol squat', 'Plank', 'Pull-up', 'Push-up', 'Russian twist',
    'Side plank', 'Single-leg hip thrust', 'Sissy squat', 'Sit-up', 'Step-up', 'Superman hold',
    'V-up', 'Walking lunge', 'Wall sit'
);

-- Other. A band, a wheel, a rope, a sled. Real equipment with nothing in common,
-- which is exactly why it is one bucket and not four glyphs nobody reads.
UPDATE exercise_types SET equipment = 'other' WHERE user_id IS NULL AND name IN (
    'Ab wheel rollout', 'Banded lateral walk', 'Battle ropes', 'Medicine ball slam',
    'Sled push'
);
-- ---- 2. A muscle as a complete answer ---------------------------------------

-- Fourteen rows, one per muscle, for the person who knows they trained biceps
-- and nothing more.
--
-- Ordinary catalogue entries, deliberately — not a flag, not a special case in
-- the schema. They get a MET, they group under their muscle in the picker, they
-- carry sets and reps, they match a routine, and they can be corrected to a
-- real exercise later by the same edit that fixes any other row. Nothing
-- downstream has to learn what they are; `genericMuscleOf` in @ct/shared reads
-- them back off the name where the picker wants to label one.
--
-- The " work" suffix is what makes them readable in a history that is otherwise
-- all proper names. "Biceps" alone in a list of sessions is ambiguous with a
-- routine called Biceps; "Biceps work — 3 × 12 @ 30 kg" is not.
--
-- 5.0 is moderate free-weight training in the compendium — the same figure the
-- named accessory lifts carry, and the honest estimate for "some biceps work"
-- when nothing more specific is known.
--
-- `equipment` stays null: not knowing the exercise means not knowing the kit,
-- and a guess here would be the one place the glyph is certainly wrong.
--
-- Aliases are the body words only. `curl`, `row`, `press` and `shrug` are
-- deliberately absent: those are movement words, and letting "curls" resolve to
-- "Biceps work" would have a generic quietly beat "Barbell curl" in
-- `findExerciseType`, which orders by name length once nothing matches exactly.
-- A real exercise must always win.
INSERT INTO exercise_types (name, category, emoji, tracks, met, muscles, aliases) VALUES
  ('Chest work',      'strength', '💪', 'reps', 5.0, ARRAY['chest'],      ARRAY['chest','pecs','pec']),
  ('Back work',       'strength', '💪', 'reps', 5.0, ARRAY['back'],       ARRAY['back','lats','lat']),
  ('Lower back work', 'strength', '💪', 'reps', 5.0, ARRAY['lower_back'], ARRAY['lower back','erectors','spinal']),
  ('Traps work',      'strength', '💪', 'reps', 5.0, ARRAY['traps'],      ARRAY['traps','trap','upper back']),
  ('Shoulders work',  'strength', '💪', 'reps', 5.0, ARRAY['shoulders'],  ARRAY['shoulders','shoulder','delts','delt']),
  ('Biceps work',     'strength', '💪', 'reps', 5.0, ARRAY['biceps'],     ARRAY['biceps','bicep','arms','arm']),
  ('Triceps work',    'strength', '💪', 'reps', 5.0, ARRAY['triceps'],    ARRAY['triceps','tricep','arms','arm']),
  ('Forearms work',   'strength', '💪', 'reps', 5.0, ARRAY['forearms'],   ARRAY['forearms','forearm','grip','wrist']),
  ('Quads work',      'strength', '💪', 'reps', 5.0, ARRAY['quads'],      ARRAY['quads','quad','thigh','legs','leg']),
  ('Hamstrings work', 'strength', '💪', 'reps', 5.0, ARRAY['hamstrings'], ARRAY['hamstrings','hamstring','hams']),
  ('Glutes work',     'strength', '💪', 'reps', 5.0, ARRAY['glutes'],     ARRAY['glutes','glute','bum','butt','hips','hip']),
  ('Adductors work',  'strength', '💪', 'reps', 5.0, ARRAY['adductors'],  ARRAY['adductors','adductor','inner thigh','groin']),
  ('Calves work',     'strength', '💪', 'reps', 5.0, ARRAY['calves'],     ARRAY['calves','calf']),
  ('Core work',       'strength', '💪', 'reps', 5.0, ARRAY['core'],       ARRAY['core','abs','ab','abdominals','obliques','stomach']);

-- The picker filters and groups by equipment on every keystroke once the search
-- box learns the word "dumbbell". Cheap, and the column is low-cardinality
-- enough that the planner will use it for the browse-by-kit case.
CREATE INDEX exercise_types_equipment ON exercise_types (equipment) WHERE equipment IS NOT NULL;
