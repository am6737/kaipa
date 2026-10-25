import { registerRootComponent } from 'expo';

import App from './App';
// Defines the background location task before anything can need it: iOS
// relaunches the app headless to deliver fixes while a trail is recording.
import './src/lib/trailRecorder';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
