/**
 * `babel-preset-expo` already carries the Reanimated/worklets plugin in SDK 54+,
 * so adding it by hand here would run the transform twice.
 */
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
