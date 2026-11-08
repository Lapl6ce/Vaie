import AsyncStorage from '@react-native-async-storage/async-storage';

/** AsyncStorage helpers that never throw. */
export async function getItem<T>(key: string, fallback: T): Promise<T> {
  try {
    const v = await AsyncStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

export async function setItem(key: string, value: unknown) {
  try {
    if (value === null || value === undefined) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export const KEYS = {
  lang: 'vaie.lang',
  profileId: 'vaie.profileId',
  serverUrl: 'vaie.serverUrl',
  adultLearn: 'vaie.adultLearn',
  trCache: (lang: string) => `vaie.tr.${lang}`,
};
