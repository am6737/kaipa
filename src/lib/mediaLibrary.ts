import * as MediaLibrary from 'expo-media-library';

export async function requestMediaLibraryPermissions(writeOnly = false) {
  return MediaLibrary.requestPermissionsAsync(writeOnly);
}

export async function createMediaLibraryAsset(uri: string) {
  await MediaLibrary.Asset.create(uri);
}
