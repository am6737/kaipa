import { registerRootComponent } from 'expo';

import App from './App';
// Defines the background location task (via trailRecorder) and starts trail
// guidance before anything can need them: iOS relaunches the app headless to
// deliver fixes while a trail is recording.
import './src/lib/trailGuide';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
