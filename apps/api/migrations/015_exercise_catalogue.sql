-- The exercises the app knows about out of the box.
--
-- Reference data rather than seed data, and therefore a migration rather than a
-- script: a fresh deployment has to end up with a usable catalogue from
-- `pnpm migrate` alone. Anything a person does that is not in here becomes a
-- row of their own, created by the agent the moment they mention it.
--
-- The MET figures are the Compendium of Physical Activities' values, rounded.
-- They are a crude model of effort — one number for an activity that varies
-- enormously by how hard you go at it — and that is what every fitness tracker
-- uses, because the alternative is asking people to rate their own exertion and
-- getting a worse number with more friction. `confidence` on the entry stays
-- honest about it.
INSERT INTO exercise_types (name, category, emoji, tracks, met) VALUES
  -- Strength. Counted in reps against a load, which is the number that matters:
  -- the burn here is small and roughly constant, and nobody lifts for calories.
  ('Bench press',            'strength', '🏋️', 'reps',     5.0),
  ('Squat',                  'strength', '🏋️', 'reps',     5.0),
  ('Deadlift',               'strength', '🏋️', 'reps',     6.0),
  ('Overhead press',         'strength', '🏋️', 'reps',     5.0),
  ('Barbell row',            'strength', '🏋️', 'reps',     5.0),
  ('Romanian deadlift',      'strength', '🏋️', 'reps',     6.0),
  ('Hip thrust',             'strength', '🏋️', 'reps',     5.0),
  ('Lat pulldown',           'strength', '🏋️', 'reps',     5.0),
  ('Seated row',             'strength', '🏋️', 'reps',     5.0),
  ('Leg press',              'strength', '🦵', 'reps',     5.0),
  ('Leg curl',               'strength', '🦵', 'reps',     5.0),
  ('Leg extension',          'strength', '🦵', 'reps',     5.0),
  ('Lunge',                  'strength', '🦵', 'reps',     4.0),
  ('Bulgarian split squat',  'strength', '🦵', 'reps',     5.0),
  ('Calf raise',             'strength', '🦵', 'reps',     3.5),
  ('Pull-up',                'strength', '🤸', 'reps',     8.0),
  ('Push-up',                'strength', '🤸', 'reps',     8.0),
  ('Dip',                    'strength', '🤸', 'reps',     8.0),
  ('Sit-up',                 'strength', '🤸', 'reps',     4.0),
  ('Plank',                  'strength', '🧘', 'duration', 3.0),
  ('Bicep curl',             'strength', '💪', 'reps',     3.5),
  ('Tricep extension',       'strength', '💪', 'reps',     3.5),
  ('Lateral raise',          'strength', '💪', 'reps',     3.5),
  ('Face pull',              'strength', '💪', 'reps',     3.5),
  ('Chest fly',              'strength', '💪', 'reps',     4.0),

  -- Cardio. Measured in ground covered where there is ground, and in time on a
  -- machine that keeps you in one place.
  ('Running',                'cardio',   '🏃', 'distance', 9.8),
  ('Walking',                'cardio',   '🚶', 'distance', 3.5),
  ('Cycling',                'cardio',   '🚴', 'distance', 7.5),
  ('Swimming',               'cardio',   '🏊', 'distance', 7.0),
  ('Rowing machine',         'cardio',   '🚣', 'duration', 7.0),
  ('Elliptical',             'cardio',   '🏃', 'duration', 5.0),
  ('Stair climber',          'cardio',   '🪜', 'duration', 9.0),
  ('Treadmill',              'cardio',   '🏃', 'duration', 8.0),
  ('Jump rope',              'cardio',   '🪢', 'duration', 12.3),

  -- A class is an hour somebody else planned. Time is all anyone knows about it.
  ('HIIT',                   'class',    '🤸', 'duration', 8.0),
  ('Spin class',             'class',    '🚴', 'duration', 8.5),
  ('CrossFit',               'class',    '🏋️', 'duration', 8.0),
  ('Circuit training',       'class',    '🤸', 'duration', 7.0),
  ('Bootcamp',               'class',    '🤸', 'duration', 7.0),

  ('Football',               'sport',    '⚽', 'duration', 7.0),
  ('Basketball',             'sport',    '🏀', 'duration', 6.5),
  ('Tennis',                 'sport',    '🎾', 'duration', 7.3),
  ('Padel',                  'sport',    '🎾', 'duration', 6.0),
  ('Squash',                 'sport',    '🎾', 'duration', 8.0),
  ('Badminton',              'sport',    '🏸', 'duration', 5.5),
  ('Climbing',               'sport',    '🧗', 'duration', 8.0),
  ('Boxing',                 'sport',    '🥊', 'duration', 7.8),
  ('Martial arts',           'sport',    '🥋', 'duration', 10.3),
  ('Golf',                   'sport',    '⛳', 'duration', 4.8),
  ('Skiing',                 'sport',    '⛷️', 'duration', 7.0),

  -- Low burn on purpose. Logging a stretch is about the streak, not the number,
  -- and inflating it would make every other figure in the app less believable.
  ('Yoga',                   'flexibility', '🧘', 'duration', 2.5),
  ('Pilates',                'flexibility', '🧘', 'duration', 3.0),
  ('Stretching',             'flexibility', '🧘', 'duration', 2.3),
  ('Mobility work',          'flexibility', '🧘', 'duration', 2.5),
  ('Foam rolling',           'flexibility', '🧘', 'duration', 2.0);
