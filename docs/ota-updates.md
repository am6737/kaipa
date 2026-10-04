# OTA updates

Kaipa uses Expo EAS Update for JavaScript and bundled asset updates. The
native binary still has to be rebuilt when a change needs a native module,
permission, SDK, or other iOS/Android configuration change.

## Channels

The EAS build profiles select the channel embedded in each binary:

- `development` → `development`
- `preview` → `preview`
- `production` → `production`

The runtime version follows the app version (`runtimeVersion: appVersion`).
Increment the app version and create new builds when the native runtime is no
longer compatible with the existing update stream.

## Publishing a JS update

Build and install a binary for the target channel first. Then publish the
matching update:

```bash
eas update --channel preview --message "修复预览版问题"
eas update --channel production --message "修复线上问题"
```

`UpdateManager` checks after startup, downloads an available update, and asks
the user to restart. If the network or update service is unavailable, the
embedded bundle continues to run.

Never publish a bundle that imports a native module absent from the installed
binary. That requires a new EAS build and store release first.
