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

`UpdateManager` checks after startup and downloads an available update. Each
published update carries an `updateMode` in its manifest:

- `silent`: reload immediately after verification.
- `prompt`: ask the user before reloading.
- `next_launch`: keep the downloaded update pending until the next app launch.

Set the mode while publishing, for example:

```bash
EXPO_UPDATE_MODE=silent eas update --channel production --message "小修复"
EXPO_UPDATE_MODE=prompt eas update --channel production --message "交互调整"
EXPO_UPDATE_MODE=next_launch eas update --channel production --message "下次启动生效"
```

If the network or update service is unavailable, the embedded bundle continues
to run.

Never publish a bundle that imports a native module absent from the installed
binary. That requires a new EAS build and store release first.
