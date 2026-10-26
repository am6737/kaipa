// The widget extension that draws the 徒步记录 Live Activity on the lock screen and in the Dynamic
// Island. The app starts and updates the activity from modules/trail-notification (iOS); this target
// only renders it. Built by @bacons/apple-targets at prebuild; needs a new dev build.
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'TrailActivity',
  displayName: '徒步记录',
  bundleIdentifier: '.trailactivity',
  deploymentTarget: '16.4',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
  colors: {
    // theme.trailMine, light and dark.
    trail: { color: '#FF5C3A', darkColor: '#FF7A55' },
  },
};
