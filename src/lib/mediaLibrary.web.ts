export async function requestMediaLibraryPermissions(_writeOnly = false, _granularPermissions?: string[]) {
  return { status: 'denied' as const };
}

export async function createMediaLibraryAsset(_uri: string) {
  throw new Error('Media library is unavailable on web');
}
