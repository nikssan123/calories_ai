-- The catalogue, widened for a picker that can be searched.
--
-- Twenty-five strength exercises were the right number for a flat row of chips,
-- because a flat row of chips is unreadable past about thirty and there was no
-- other way in. Search changes what the constraint is: the cost of an exercise
-- nobody looks for drops to nothing, and the cost of a missing one is somebody
-- discovering the app does not know what a hack squat is. So this trades a list
-- you could read in one glance for one you can ask a question of.
--
-- Three things happen here, in an order that matters:
--   1. the muscle vocabulary widens from ten to fourteen — the constraint has
--      to accept the new words before any row can carry them;
--   2. exercises gain `aliases`, which is what makes "RDL" and "OHP" findable;
--   3. the catalogue roughly quadruples, and every sport somebody might
--      actually play arrives with it.

-- ---- 1. Four more muscles ---------------------------------------------------

-- `lower_back`, `traps`, `forearms` and `adductors`. Each earns its place by
-- owning exercises that were previously filed somewhere misleading: a back
-- extension is not a lat pulldown, and under a *heading* the difference stops
-- being pedantic and starts being how somebody finds it.
--
-- Hip abduction deliberately did not get one — the abduction machine and band
-- walks are glute medius, so they are `glutes`, which is both anatomically
-- honest and where a person training glutes would look.
ALTER TABLE exercise_types DROP CONSTRAINT exercise_types_muscles_known;
ALTER TABLE exercise_types ADD CONSTRAINT exercise_types_muscles_known CHECK (
  muscles <@ ARRAY[
    'chest','back','lower_back','traps','shoulders','biceps','triceps','forearms',
    'quads','hamstrings','glutes','adductors','calves','core'
  ]::TEXT[]
);

-- ---- 2. Aliases -------------------------------------------------------------

-- What somebody types instead of the name.
--
-- Search-only and never displayed: the catalogue keeps one name per exercise so
-- history stays comparable, and this is the list of things that should *find*
-- that name. It is where the gap lives between what this app calls a movement
-- and what a gym calls it — "RDL", "OHP", "pulldown", "bench".
--
-- Empty for anything a user invented, which is already named in their words.
ALTER TABLE exercise_types ADD COLUMN aliases TEXT[] NOT NULL DEFAULT '{}';

-- The twenty-five that were already here. Muscle terms are handled in code
-- (`muscleTerms` in @ct/shared), so nothing below repeats "chest" or "legs" —
-- these are abbreviations, plurals and the names other apps use.
UPDATE exercise_types SET aliases = v.aliases FROM (VALUES
  ('bench press',           ARRAY['bench','bp','flat bench','barbell bench']),
  ('chest fly',             ARRAY['fly','flye','flyes','dumbbell fly']),
  ('push-up',               ARRAY['pushup','press-up','pressup']),
  ('dip',                   ARRAY['dips','parallel bar dip']),
  ('overhead press',        ARRAY['ohp','military press','shoulder press','strict press']),
  ('lateral raise',         ARRAY['lat raise','side raise','laterals']),
  ('face pull',             ARRAY['facepull','rear delt pull']),
  ('tricep extension',      ARRAY['tricep ext','triceps extension']),
  ('barbell row',           ARRAY['bent over row','bor','pendlay']),
  ('lat pulldown',          ARRAY['pulldown','lat pull','pull down']),
  ('seated row',            ARRAY['cable row','machine row','low row']),
  ('pull-up',               ARRAY['pullup','pull ups','chins']),
  ('bicep curl',            ARRAY['curl','curls','dumbbell curl','db curl']),
  ('deadlift',              ARRAY['dl','conventional deadlift','pull']),
  ('romanian deadlift',     ARRAY['rdl','romanian','stiff leg']),
  ('squat',                 ARRAY['back squat','barbell squat','squats']),
  ('leg press',             ARRAY['press machine','45 degree press']),
  ('leg extension',         ARRAY['knee extension','quad extension']),
  ('leg curl',              ARRAY['hamstring curl','knee curl']),
  ('lunge',                 ARRAY['lunges','forward lunge']),
  ('bulgarian split squat', ARRAY['bss','rear foot elevated','rfess']),
  ('hip thrust',            ARRAY['glute bridge barbell','thrusts']),
  ('calf raise',            ARRAY['calf raises','heel raise']),
  ('sit-up',                ARRAY['situp','sit ups','crunches']),
  ('plank',                 ARRAY['front plank','planks']),
  ('running',               ARRAY['run','jog','5k','10k']),
  ('walking',               ARRAY['walk','steps']),
  ('cycling',               ARRAY['bike','bicycle','ride','cycle']),
  ('swimming',              ARRAY['swim','laps','pool']),
  ('rowing machine',        ARRAY['erg','rower','concept2','c2']),
  ('elliptical',            ARRAY['cross trainer','x trainer']),
  ('stair climber',         ARRAY['stairmaster','step mill','stepmill']),
  ('treadmill',             ARRAY['tready','running machine']),
  ('jump rope',            ARRAY['skipping','skip rope','jumprope']),
  ('hiit',                  ARRAY['high intensity','intervals','tabata']),
  ('spin class',            ARRAY['spinning','indoor cycling']),
  ('crossfit',              ARRAY['wod','box','metcon']),
  ('circuit training',      ARRAY['circuits']),
  ('bootcamp',              ARRAY['boot camp']),
  ('football',              ARRAY['soccer','5 a side','five a side','footy']),
  ('basketball',            ARRAY['bball','hoops']),
  ('tennis',                ARRAY['lawn tennis']),
  ('padel',                 ARRAY['paddle tennis']),
  ('squash',                ARRAY['racquetball']),
  ('badminton',             ARRAY['shuttlecock']),
  ('climbing',              ARRAY['rock climbing','sport climbing','lead climbing']),
  ('boxing',                ARRAY['sparring','pads','bag work']),
  ('martial arts',          ARRAY['karate','taekwondo','kung fu','mma']),
  ('golf',                  ARRAY['18 holes','driving range']),
  ('skiing',                ARRAY['ski','downhill','piste']),
  ('yoga',                  ARRAY['hatha','ashtanga','flow']),
  ('pilates',               ARRAY['mat pilates']),
  ('stretching',            ARRAY['stretch','cool down']),
  ('mobility work',         ARRAY['mobility','warm up','prehab']),
  ('foam rolling',          ARRAY['foam roller','smr','myofascial'])
) AS v(name, aliases)
WHERE exercise_types.user_id IS NULL AND lower(exercise_types.name) = v.name;

-- Two of the originals sat under the wrong heading once headings existed. A
-- deadlift is the compound the whole hinge pattern is named after and its
-- primary is the posterior chain, not the lats.
UPDATE exercise_types SET muscles = ARRAY['lower_back','hamstrings','glutes','back']
  WHERE user_id IS NULL AND lower(name) = 'deadlift';
UPDATE exercise_types SET muscles = ARRAY['shoulders','back','traps']
  WHERE user_id IS NULL AND lower(name) = 'face pull';

-- ---- 3. The catalogue -------------------------------------------------------

-- MET figures are the Compendium of Physical Activities', rounded, exactly as
-- migration 015 established. They are a crude model of effort and that is what
-- every tracker uses; `confidence` on the entry stays honest about it.
--
-- Grouped by primary muscle, in the order the picker draws — which is the order
-- of MUSCLE_GROUPS in @ct/shared, running down the body rather than the
-- alphabet. Primary muscle first in every array: it decides the heading.
INSERT INTO exercise_types (name, category, emoji, tracks, met, muscles, aliases) VALUES

  -- Chest ---------------------------------------------------------------------
  ('Incline bench press',    'strength', '🏋️', 'reps', 5.0, ARRAY['chest','shoulders','triceps'], ARRAY['incline bench','incline press']),
  ('Decline bench press',    'strength', '🏋️', 'reps', 5.0, ARRAY['chest','triceps'],             ARRAY['decline bench']),
  ('Dumbbell bench press',   'strength', '🏋️', 'reps', 5.0, ARRAY['chest','triceps','shoulders'], ARRAY['db bench','dumbbell press']),
  ('Incline dumbbell press', 'strength', '🏋️', 'reps', 5.0, ARRAY['chest','shoulders','triceps'], ARRAY['incline db press']),
  ('Machine chest press',    'strength', '🏋️', 'reps', 4.5, ARRAY['chest','triceps'],             ARRAY['chest press','seated press']),
  ('Cable crossover',        'strength', '💪', 'reps', 4.0, ARRAY['chest'],                       ARRAY['crossover','cable fly']),
  ('Pec deck',               'strength', '💪', 'reps', 4.0, ARRAY['chest'],                       ARRAY['machine fly','butterfly']),
  ('Incline push-up',        'strength', '🤸', 'reps', 6.0, ARRAY['chest','triceps'],             ARRAY['elevated pushup']),
  ('Decline push-up',        'strength', '🤸', 'reps', 8.0, ARRAY['chest','shoulders'],           ARRAY['feet elevated pushup']),

  -- Back ----------------------------------------------------------------------
  ('Chin-up',                'strength', '🤸', 'reps', 8.0, ARRAY['back','biceps'],               ARRAY['chinup','underhand pullup']),
  ('Dumbbell row',           'strength', '🏋️', 'reps', 5.0, ARRAY['back','biceps'],               ARRAY['db row','single arm row','one arm row']),
  ('T-bar row',              'strength', '🏋️', 'reps', 5.0, ARRAY['back','biceps'],               ARRAY['tbar','t bar row']),
  ('Pendlay row',            'strength', '🏋️', 'reps', 5.5, ARRAY['back','biceps'],               ARRAY['dead stop row']),
  ('Chest-supported row',    'strength', '🏋️', 'reps', 5.0, ARRAY['back','biceps'],               ARRAY['seal row','csr']),
  ('Machine row',            'strength', '🏋️', 'reps', 4.5, ARRAY['back','biceps'],               ARRAY['hammer row','plate loaded row']),
  ('Inverted row',           'strength', '🤸', 'reps', 6.0, ARRAY['back','biceps'],               ARRAY['bodyweight row','ring row']),
  ('Straight-arm pulldown',  'strength', '💪', 'reps', 4.0, ARRAY['back'],                        ARRAY['pullover','lat pushdown']),
  ('Rack pull',              'strength', '🏋️', 'reps', 6.0, ARRAY['back','glutes','hamstrings'],  ARRAY['partial deadlift','block pull']),

  -- Lower back ----------------------------------------------------------------
  ('Back extension',         'strength', '🏋️', 'reps', 4.0, ARRAY['lower_back','glutes','hamstrings'], ARRAY['hyperextension','45 degree extension']),
  ('Good morning',           'strength', '🏋️', 'reps', 5.0, ARRAY['lower_back','hamstrings','glutes'], ARRAY['gm','good mornings']),
  ('Reverse hyperextension', 'strength', '🏋️', 'reps', 4.0, ARRAY['lower_back','glutes'],              ARRAY['reverse hyper']),
  ('Superman hold',          'strength', '🧘', 'duration', 3.0, ARRAY['lower_back'],                   ARRAY['superman']),

  -- Traps ---------------------------------------------------------------------
  ('Barbell shrug',          'strength', '🏋️', 'reps', 4.0, ARRAY['traps'],                       ARRAY['shrug','shrugs']),
  ('Dumbbell shrug',         'strength', '🏋️', 'reps', 4.0, ARRAY['traps'],                       ARRAY['db shrug']),
  ('Upright row',            'strength', '🏋️', 'reps', 4.5, ARRAY['traps','shoulders'],           ARRAY['high pull']),

  -- Shoulders -----------------------------------------------------------------
  ('Dumbbell shoulder press','strength', '🏋️', 'reps', 5.0, ARRAY['shoulders','triceps'],         ARRAY['db shoulder press','seated db press']),
  ('Arnold press',           'strength', '🏋️', 'reps', 5.0, ARRAY['shoulders','triceps'],         ARRAY['arnolds']),
  ('Machine shoulder press', 'strength', '🏋️', 'reps', 4.5, ARRAY['shoulders','triceps'],         ARRAY['seated machine press']),
  ('Front raise',            'strength', '💪', 'reps', 3.5, ARRAY['shoulders'],                    ARRAY['front delt raise']),
  ('Rear delt fly',          'strength', '💪', 'reps', 3.5, ARRAY['shoulders'],                    ARRAY['reverse fly','rear delts','bent over fly']),
  ('Cable lateral raise',    'strength', '💪', 'reps', 3.5, ARRAY['shoulders'],                    ARRAY['cable side raise']),
  ('Landmine press',         'strength', '🏋️', 'reps', 5.0, ARRAY['shoulders','chest','triceps'], ARRAY['landmine']),
  ('Push press',             'strength', '🏋️', 'reps', 6.0, ARRAY['shoulders','triceps','quads'], ARRAY['jerk']),
  ('Handstand push-up',      'strength', '🤸', 'reps', 8.0, ARRAY['shoulders','triceps'],          ARRAY['hspu']),

  -- Biceps --------------------------------------------------------------------
  ('Barbell curl',           'strength', '💪', 'reps', 3.5, ARRAY['biceps'],                       ARRAY['bb curl','straight bar curl']),
  ('Hammer curl',            'strength', '💪', 'reps', 3.5, ARRAY['biceps','forearms'],            ARRAY['neutral curl']),
  ('Preacher curl',          'strength', '💪', 'reps', 3.5, ARRAY['biceps'],                       ARRAY['scott curl']),
  ('Incline dumbbell curl',  'strength', '💪', 'reps', 3.5, ARRAY['biceps'],                       ARRAY['incline curl']),
  ('Cable curl',             'strength', '💪', 'reps', 3.5, ARRAY['biceps'],                       ARRAY['rope curl']),
  ('Concentration curl',     'strength', '💪', 'reps', 3.5, ARRAY['biceps'],                       ARRAY['seated curl']),

  -- Triceps -------------------------------------------------------------------
  ('Tricep pushdown',        'strength', '💪', 'reps', 3.5, ARRAY['triceps'],                      ARRAY['pushdown','rope pushdown','cable pushdown']),
  ('Skull crusher',          'strength', '💪', 'reps', 4.0, ARRAY['triceps'],                      ARRAY['lying extension','french press']),
  ('Overhead tricep extension','strength','💪','reps', 3.5, ARRAY['triceps'],                      ARRAY['overhead extension','cable overhead']),
  ('Close-grip bench press', 'strength', '🏋️', 'reps', 5.0, ARRAY['triceps','chest'],              ARRAY['cgbp','close grip']),
  ('Tricep kickback',        'strength', '💪', 'reps', 3.0, ARRAY['triceps'],                      ARRAY['kickback']),
  ('Bench dip',              'strength', '🤸', 'reps', 5.0, ARRAY['triceps','chest'],              ARRAY['chair dip']),
  ('Diamond push-up',        'strength', '🤸', 'reps', 8.0, ARRAY['triceps','chest'],              ARRAY['close grip pushup','triangle pushup']),

  -- Forearms ------------------------------------------------------------------
  ('Wrist curl',             'strength', '💪', 'reps', 3.0, ARRAY['forearms'],                     ARRAY['forearm curl']),
  ('Reverse wrist curl',     'strength', '💪', 'reps', 3.0, ARRAY['forearms'],                     ARRAY['extensor curl']),
  ('Reverse curl',           'strength', '💪', 'reps', 3.5, ARRAY['forearms','biceps'],            ARRAY['overhand curl']),
  ('Farmer''s walk',         'strength', '🏋️', 'duration', 5.0, ARRAY['forearms','traps','core'],  ARRAY['farmers carry','loaded carry','suitcase carry']),
  ('Dead hang',              'strength', '🤸', 'duration', 4.0, ARRAY['forearms','back'],          ARRAY['bar hang','hang']),

  -- Quads ---------------------------------------------------------------------
  ('Front squat',            'strength', '🏋️', 'reps', 5.5, ARRAY['quads','glutes','core'],        ARRAY['fsq']),
  ('Goblet squat',           'strength', '🦵', 'reps', 5.0, ARRAY['quads','glutes'],               ARRAY['kettlebell squat']),
  ('Hack squat',             'strength', '🦵', 'reps', 5.0, ARRAY['quads','glutes'],               ARRAY['machine squat']),
  ('Split squat',            'strength', '🦵', 'reps', 5.0, ARRAY['quads','glutes'],               ARRAY['static lunge']),
  ('Step-up',                'strength', '🦵', 'reps', 5.0, ARRAY['quads','glutes'],               ARRAY['box step up','stepup']),
  ('Walking lunge',          'strength', '🦵', 'reps', 5.0, ARRAY['quads','glutes'],               ARRAY['walking lunges']),
  ('Box squat',              'strength', '🦵', 'reps', 5.0, ARRAY['quads','glutes'],               ARRAY['bench squat']),
  ('Smith machine squat',    'strength', '🦵', 'reps', 5.0, ARRAY['quads','glutes'],               ARRAY['smith squat']),
  ('Pistol squat',           'strength', '🦵', 'reps', 6.0, ARRAY['quads','glutes','core'],        ARRAY['single leg squat']),
  ('Sissy squat',            'strength', '🦵', 'reps', 4.5, ARRAY['quads'],                        ARRAY[]::TEXT[]),
  ('Wall sit',               'strength', '🦵', 'duration', 4.0, ARRAY['quads'],                    ARRAY['wall squat']),

  -- Hamstrings ----------------------------------------------------------------
  ('Seated leg curl',        'strength', '🦵', 'reps', 4.5, ARRAY['hamstrings'],                   ARRAY['seated hamstring curl']),
  ('Nordic curl',            'strength', '🦵', 'reps', 5.0, ARRAY['hamstrings'],                   ARRAY['nordic hamstring','razor curl']),
  ('Stiff-leg deadlift',     'strength', '🏋️', 'reps', 6.0, ARRAY['hamstrings','glutes','lower_back'], ARRAY['sldl','straight leg deadlift']),
  ('Single-leg Romanian deadlift','strength','🦵','reps',5.0, ARRAY['hamstrings','glutes'],        ARRAY['single leg rdl','sl rdl']),
  ('Glute-ham raise',        'strength', '🦵', 'reps', 5.0, ARRAY['hamstrings','glutes'],          ARRAY['ghr','ghd raise']),

  -- Glutes --------------------------------------------------------------------
  ('Glute bridge',           'strength', '🦵', 'reps', 4.0, ARRAY['glutes','hamstrings'],          ARRAY['bridge','floor bridge']),
  ('Single-leg hip thrust',  'strength', '🦵', 'reps', 4.5, ARRAY['glutes','hamstrings'],          ARRAY['sl hip thrust']),
  ('Cable kickback',         'strength', '🦵', 'reps', 3.5, ARRAY['glutes'],                       ARRAY['glute kickback','donkey kick']),
  ('Hip abduction',          'strength', '🦵', 'reps', 3.5, ARRAY['glutes'],                       ARRAY['abduction machine','abductor','outer thigh']),
  ('Banded lateral walk',    'strength', '🦵', 'reps', 3.5, ARRAY['glutes'],                       ARRAY['monster walk','crab walk','band walk']),
  ('Sumo deadlift',          'strength', '🏋️', 'reps', 6.0, ARRAY['glutes','quads','hamstrings'],  ARRAY['sumo']),
  ('Curtsy lunge',           'strength', '🦵', 'reps', 5.0, ARRAY['glutes','quads'],               ARRAY['curtsey lunge']),
  ('Kettlebell swing',       'strength', '🏋️', 'reps', 7.0, ARRAY['glutes','hamstrings','core'],   ARRAY['kb swing','swings']),

  -- Adductors -----------------------------------------------------------------
  ('Hip adduction',          'strength', '🦵', 'reps', 3.5, ARRAY['adductors'],                    ARRAY['adduction machine','inner thigh machine','adductor']),
  ('Sumo squat',             'strength', '🦵', 'reps', 5.0, ARRAY['adductors','quads','glutes'],   ARRAY['plie squat','wide squat']),
  ('Cossack squat',          'strength', '🦵', 'reps', 5.0, ARRAY['adductors','quads'],            ARRAY['lateral squat','side squat']),
  ('Copenhagen plank',       'strength', '🧘', 'duration', 4.0, ARRAY['adductors','core'],         ARRAY['copenhagen']),

  -- Calves --------------------------------------------------------------------
  ('Standing calf raise',    'strength', '🦵', 'reps', 3.5, ARRAY['calves'],                       ARRAY['standing calves']),
  ('Seated calf raise',      'strength', '🦵', 'reps', 3.5, ARRAY['calves'],                       ARRAY['seated calves','soleus raise']),

  -- Core ----------------------------------------------------------------------
  ('Crunch',                 'strength', '🤸', 'reps', 3.5, ARRAY['core'],                         ARRAY['crunches','ab crunch']),
  ('Bicycle crunch',         'strength', '🤸', 'reps', 4.0, ARRAY['core'],                         ARRAY['bicycles']),
  ('Cable crunch',           'strength', '🤸', 'reps', 4.0, ARRAY['core'],                         ARRAY['kneeling crunch','rope crunch']),
  ('Leg raise',              'strength', '🤸', 'reps', 4.0, ARRAY['core'],                         ARRAY['lying leg raise','leg lift']),
  ('Hanging leg raise',      'strength', '🤸', 'reps', 5.0, ARRAY['core','forearms'],              ARRAY['hlr','hanging knee raise']),
  ('Russian twist',          'strength', '🤸', 'reps', 4.0, ARRAY['core'],                         ARRAY['twists','oblique twist']),
  ('V-up',                   'strength', '🤸', 'reps', 4.5, ARRAY['core'],                         ARRAY['vup','jackknife']),
  ('Ab wheel rollout',       'strength', '🤸', 'reps', 5.0, ARRAY['core'],                         ARRAY['ab wheel','rollout','ab roller']),
  ('Woodchopper',            'strength', '🤸', 'reps', 4.0, ARRAY['core'],                         ARRAY['cable chop','wood chop']),
  ('Side plank',             'strength', '🧘', 'duration', 3.0, ARRAY['core'],                     ARRAY['side planks']),
  ('Hollow hold',            'strength', '🧘', 'duration', 4.0, ARRAY['core'],                     ARRAY['hollow body']),
  ('Flutter kicks',          'strength', '🤸', 'duration', 4.0, ARRAY['core'],                     ARRAY['scissor kicks']),
  ('Mountain climbers',      'strength', '🤸', 'duration', 8.0, ARRAY['core','shoulders'],         ARRAY['mountain climber']),
  ('Dead bug',               'strength', '🧘', 'reps', 3.0, ARRAY['core'],                         ARRAY['deadbug']),
  ('Bird dog',               'strength', '🧘', 'reps', 3.0, ARRAY['core','lower_back'],            ARRAY['birddog']),

  -- Whole-body lifts. No single primary, so the heaviest joint leads and the
  -- heading follows it — which is where somebody programming them would look.
  ('Power clean',            'strength', '🏋️', 'reps', 8.0, ARRAY['quads','back','shoulders'],     ARRAY['clean','olympic lift']),
  ('Clean and press',        'strength', '🏋️', 'reps', 8.0, ARRAY['shoulders','quads','back'],     ARRAY['clean and jerk','c&p']),
  ('Snatch',                 'strength', '🏋️', 'reps', 8.0, ARRAY['shoulders','quads','back'],     ARRAY['power snatch']),
  ('Thruster',               'strength', '🏋️', 'reps', 8.0, ARRAY['quads','shoulders'],            ARRAY['thrusters']),
  ('Burpee',                 'strength', '🤸', 'reps', 8.0, ARRAY['quads','chest','core'],         ARRAY['burpees']),
  ('Box jump',               'strength', '🦵', 'reps', 8.0, ARRAY['quads','calves'],               ARRAY['box jumps','plyo jump']),
  ('Sled push',              'strength', '🦵', 'duration', 9.0, ARRAY['quads','glutes'],           ARRAY['prowler','sled']),
  ('Battle ropes',           'strength', '💪', 'duration', 8.0, ARRAY['shoulders','core'],         ARRAY['ropes','battling ropes']),
  ('Medicine ball slam',     'strength', '🤸', 'reps', 7.0, ARRAY['core','shoulders'],             ARRAY['ball slam','med ball']),
  ('Turkish get-up',         'strength', '🏋️', 'reps', 6.0, ARRAY['core','shoulders'],             ARRAY['tgu','get up']),

  -- Cardio --------------------------------------------------------------------
  ('Jogging',                'cardio', '🏃', 'distance', 7.0, ARRAY[]::TEXT[], ARRAY['easy run','slow run','zone 2']),
  ('Trail running',          'cardio', '🏃', 'distance', 10.0, ARRAY[]::TEXT[], ARRAY['trail run','fell running']),
  ('Sprints',                'cardio', '🏃', 'duration', 12.0, ARRAY[]::TEXT[], ARRAY['sprint','intervals','track sprints']),
  ('Hiking',                 'cardio', '🥾', 'distance', 6.0, ARRAY[]::TEXT[], ARRAY['hike','trekking','walk in the hills']),
  ('Rucking',                'cardio', '🎒', 'distance', 6.0, ARRAY[]::TEXT[], ARRAY['ruck','weighted walk']),
  ('Nordic walking',         'cardio', '🚶', 'distance', 4.8, ARRAY[]::TEXT[], ARRAY['pole walking']),
  ('Incline walk',           'cardio', '🚶', 'duration', 5.5, ARRAY[]::TEXT[], ARRAY['incline treadmill','12-3-30','hill walk']),
  ('Stationary bike',        'cardio', '🚴', 'duration', 7.0, ARRAY[]::TEXT[], ARRAY['exercise bike','upright bike','recumbent']),
  ('Assault bike',           'cardio', '🚴', 'duration', 9.0, ARRAY[]::TEXT[], ARRAY['air bike','echo bike','fan bike']),
  ('SkiErg',                 'cardio', '⛷️', 'duration', 8.0, ARRAY[]::TEXT[], ARRAY['ski erg','ski machine']),
  ('Open water swimming',    'cardio', '🏊', 'distance', 8.0, ARRAY[]::TEXT[], ARRAY['sea swim','lake swim','wild swimming']),

  -- Classes -------------------------------------------------------------------
  ('Zumba',                  'class', '💃', 'duration', 7.5, ARRAY[]::TEXT[], ARRAY['dance fitness']),
  ('Body pump',              'class', '🏋️', 'duration', 7.0, ARRAY[]::TEXT[], ARRAY['bodypump','pump class']),
  ('Aerobics',               'class', '🤸', 'duration', 7.0, ARRAY[]::TEXT[], ARRAY['aerobic class']),
  ('Step class',             'class', '🤸', 'duration', 8.5, ARRAY[]::TEXT[], ARRAY['step aerobics']),
  ('Barre',                  'class', '🩰', 'duration', 4.0, ARRAY[]::TEXT[], ARRAY['barre class']),
  ('Aqua aerobics',          'class', '🏊', 'duration', 5.5, ARRAY[]::TEXT[], ARRAY['water aerobics','aquafit']),
  ('Kickboxing class',       'class', '🥊', 'duration', 8.5, ARRAY[]::TEXT[], ARRAY['kickboxing','body combat']),
  ('TRX class',              'class', '🤸', 'duration', 6.0, ARRAY[]::TEXT[], ARRAY['trx','suspension training']),
  ('Reformer pilates',       'class', '🧘', 'duration', 4.0, ARRAY[]::TEXT[], ARRAY['reformer']),

  -- Sport ---------------------------------------------------------------------
  ('Volleyball',             'sport', '🏐', 'duration', 6.0, ARRAY[]::TEXT[], ARRAY['volley']),
  ('Beach volleyball',       'sport', '🏐', 'duration', 8.0, ARRAY[]::TEXT[], ARRAY['beach volley','sand volleyball']),
  ('Handball',               'sport', '🤾', 'duration', 8.0, ARRAY[]::TEXT[], ARRAY['team handball']),
  ('Hockey',                 'sport', '🏑', 'duration', 7.8, ARRAY[]::TEXT[], ARRAY['field hockey']),
  ('Ice hockey',             'sport', '🏒', 'duration', 8.0, ARRAY[]::TEXT[], ARRAY['puck']),
  ('Rugby',                  'sport', '🏉', 'duration', 8.3, ARRAY[]::TEXT[], ARRAY['rugby union','rugby league']),
  ('American football',      'sport', '🏈', 'duration', 8.0, ARRAY[]::TEXT[], ARRAY['gridiron','nfl']),
  ('Baseball',               'sport', '⚾', 'duration', 5.0, ARRAY[]::TEXT[], ARRAY['softball']),
  ('Cricket',                'sport', '🏏', 'duration', 4.8, ARRAY[]::TEXT[], ARRAY['nets','batting']),
  ('Netball',                'sport', '🏐', 'duration', 7.0, ARRAY[]::TEXT[], ARRAY[]::TEXT[]),
  ('Lacrosse',               'sport', '🥍', 'duration', 8.0, ARRAY[]::TEXT[], ARRAY[]::TEXT[]),
  ('Table tennis',           'sport', '🏓', 'duration', 4.0, ARRAY[]::TEXT[], ARRAY['ping pong','pingpong']),
  ('Bouldering',             'sport', '🧗', 'duration', 7.0, ARRAY[]::TEXT[], ARRAY['boulder','climbing gym']),
  ('Surfing',                'sport', '🏄', 'duration', 3.0, ARRAY[]::TEXT[], ARRAY['surf']),
  ('Snowboarding',           'sport', '🏂', 'duration', 5.3, ARRAY[]::TEXT[], ARRAY['snowboard','board']),
  ('Ice skating',            'sport', '⛸️', 'duration', 7.0, ARRAY[]::TEXT[], ARRAY['skating','figure skating']),
  ('Rollerblading',          'sport', '🛼', 'duration', 7.5, ARRAY[]::TEXT[], ARRAY['inline skating','roller skating']),
  ('Skateboarding',          'sport', '🛹', 'duration', 5.0, ARRAY[]::TEXT[], ARRAY['skateboard','skating']),
  ('Kayaking',               'sport', '🛶', 'duration', 5.0, ARRAY[]::TEXT[], ARRAY['kayak','paddling']),
  ('Canoeing',               'sport', '🛶', 'duration', 4.5, ARRAY[]::TEXT[], ARRAY['canoe']),
  ('Sailing',                'sport', '⛵', 'duration', 3.0, ARRAY[]::TEXT[], ARRAY['sail','yachting']),
  ('Water polo',             'sport', '🤽', 'duration', 10.0, ARRAY[]::TEXT[], ARRAY[]::TEXT[]),
  ('Horse riding',           'sport', '🏇', 'duration', 5.5, ARRAY[]::TEXT[], ARRAY['equestrian','horseback']),
  ('Dancing',                'sport', '💃', 'duration', 5.5, ARRAY[]::TEXT[], ARRAY['dance','clubbing']),
  ('Salsa dancing',          'sport', '💃', 'duration', 5.0, ARRAY[]::TEXT[], ARRAY['salsa','bachata','latin dance']),
  ('Gymnastics',             'sport', '🤸', 'duration', 5.3, ARRAY[]::TEXT[], ARRAY['tumbling']),
  ('Fencing',                'sport', '🤺', 'duration', 6.0, ARRAY[]::TEXT[], ARRAY['epee','sabre','foil']),
  ('Wrestling',              'sport', '🤼', 'duration', 6.0, ARRAY[]::TEXT[], ARRAY['grappling']),
  ('Jiu-jitsu',              'sport', '🥋', 'duration', 10.0, ARRAY[]::TEXT[], ARRAY['bjj','brazilian jiu jitsu','rolling']),
  ('Judo',                   'sport', '🥋', 'duration', 10.3, ARRAY[]::TEXT[], ARRAY[]::TEXT[]),
  ('Muay Thai',              'sport', '🥊', 'duration', 9.8, ARRAY[]::TEXT[], ARRAY['thai boxing','muay']),
  ('Ultimate frisbee',       'sport', '🥏', 'duration', 8.0, ARRAY[]::TEXT[], ARRAY['frisbee','ultimate','disc golf']),
  ('Bowling',                'sport', '🎳', 'duration', 3.0, ARRAY[]::TEXT[], ARRAY[]::TEXT[]),

  -- Flexibility ---------------------------------------------------------------
  ('Hot yoga',               'flexibility', '🧘', 'duration', 4.0, ARRAY[]::TEXT[], ARRAY['bikram']),
  ('Vinyasa yoga',           'flexibility', '🧘', 'duration', 4.0, ARRAY[]::TEXT[], ARRAY['vinyasa','power yoga']),
  ('Yin yoga',               'flexibility', '🧘', 'duration', 2.0, ARRAY[]::TEXT[], ARRAY['yin','restorative']),
  ('Tai chi',                'flexibility', '🧘', 'duration', 3.0, ARRAY[]::TEXT[], ARRAY['taichi','qigong']),
  ('Dynamic warm-up',        'flexibility', '🧘', 'duration', 3.0, ARRAY[]::TEXT[], ARRAY['dynamic stretching','activation']);

-- Search reads `aliases` on every keystroke of a picker that now holds a couple
-- of hundred rows, and the whole array is scanned per row without this.
CREATE INDEX exercise_types_aliases ON exercise_types USING GIN (aliases);
