const fs = require('fs');
const path = require('path');
const plist = require('@expo/plist').default;
const { withDangerousMod, withXcodeProject } = require('expo/config-plugins');

/*
 * `@expo/plist` is a direct dependency of this package rather than something
 * borrowed off `expo-widgets`, and it has to be. A config plugin is not only
 * read by `expo prebuild`: `expo-constants` re-evaluates the whole app config
 * from an Xcode build phase, with the working directory inside `ios/Pods`, and
 * under pnpm's strict layout a package this one does not itself depend on does
 * not resolve from there. It failed there and nowhere else — prebuild was
 * green, the build was not.
 */

/**
 * Puts the display face inside the widget extension.
 *
 * A widget extension is its own bundle and its own process. `expo-font` loads
 * Baloo into the *app*, which the extension cannot see, and `Font.custom` on a
 * family that is not registered does not fail — it quietly returns the system
 * face. So the widget would draw, look almost right, and be set in SF: the same
 * trap `theme.ts` describes on the Android side, where a missed font name falls
 * back to `Typeface.DEFAULT` without a word. It is the kind of bug you only
 * catch by knowing what it was supposed to look like.
 *
 * `expo-widgets` generates the target but has nothing to say about resources,
 * so this adds the three things a font needs and the docs do not cover: the
 * file inside the target's directory, a `Resources` build phase to copy it into
 * the bundle, and `UIAppFonts` in the extension's own `Info.plist`.
 *
 * Ordering matters, and it runs backwards. `withWidgetSourceFiles` deletes and
 * rewrites the whole target directory on every prebuild, so this has to happen
 * after it — and mods are last-in-first-out: `withMod` runs its own action and
 * *then* calls the mod registered before it. So this plugin is listed **before**
 * `expo-widgets` in `app.json` in order to run after it. Listed the intuitive
 * way round it does not fail, it silently finds no target and does nothing,
 * which is how the first cut of this shipped a widget set in the system face.
 * Hence the warning below rather than a quiet `return`.
 */

const TARGET = 'ExpoWidgetsTarget';
const FONT = 'Baloo2_800ExtraBold.ttf';

const withWidgetFont = (config) => {
  /* The file itself, plus the extension's own Info.plist entry. Both land in
   * the directory `expo-widgets` has just finished recreating. */
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const target = path.join(config.modRequest.platformProjectRoot, TARGET);
      if (!fs.existsSync(target)) {
        console.warn(
          `[with-widget-font] ${TARGET} does not exist yet, so ${FONT} was not installed. ` +
            'List this plugin before "expo-widgets" in app.json: config plugin mods run last-in-first-out.',
        );
        return config;
      }

      fs.copyFileSync(
        path.join(config.modRequest.projectRoot, 'assets', 'fonts', FONT),
        path.join(target, FONT),
      );

      const infoPlistPath = path.join(target, 'Info.plist');
      const infoPlist = plist.parse(fs.readFileSync(infoPlistPath, 'utf8'));
      infoPlist.UIAppFonts = [FONT];
      fs.writeFileSync(infoPlistPath, plist.build(infoPlist));

      return config;
    },
  ]);

  /* And the build phase that copies it in. Without this the file sits in the
   * directory, is never packaged, and `Font.custom` misses exactly as before. */
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const targetUuid = project.findTargetKey(TARGET);
    if (!targetUuid) {
      console.warn(`[with-widget-font] no ${TARGET} target in the Xcode project; ${FONT} was not linked.`);
      return config;
    }

    if (fileReferenceFor(project, FONT)) return config;

    /*
     * `addResourceFile` would be the obvious call and cannot be used: it runs
     * `correctForResourcesPath`, which dereferences a group named `Resources`
     * without checking that one exists, and in this project none does. This
     * creates the phase and puts the file in it in one go — the target is
     * generated fresh by `expo-widgets` and has no `Resources` phase yet.
     */
    project.addBuildPhase([FONT], 'PBXResourcesBuildPhase', 'Resources', targetUuid, 'app_extension', '""');

    /*
     * The reference is created with `sourceTree = "<group>"`, so it is resolved
     * relative to whichever group holds it — and nothing holds it yet. Putting
     * it in the target's group, whose path is the target directory, is what
     * makes the bare filename point at the file copied above.
     */
    const reference = fileReferenceFor(project, FONT);
    const group = project.pbxGroupByName(TARGET);
    if (reference && group) {
      group.children.push({ value: reference, comment: FONT });
    }

    return config;
  });
};

/** The uuid of the file reference for `name`, or null. Paths may be quoted. */
function fileReferenceFor(project, name) {
  const references = project.pbxFileReferenceSection();
  for (const key of Object.keys(references)) {
    if (key.endsWith('_comment')) continue;
    const filePath = references[key]?.path;
    if (filePath === name || filePath === `"${name}"`) return key;
  }
  return null;
}

module.exports = withWidgetFont;
