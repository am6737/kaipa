const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Supabase's local Docker database contains private/permission-restricted
// files and is not part of the app bundle. Keep Metro from traversing it.
config.resolver.blockList = [
  ...(config.resolver.blockList || []),
  /[/\\]infra[/\\]supabase[/\\]docker[/\\]volumes[/\\]db[/\\]data(?:[/\\]|$)/,
];

module.exports = config;
