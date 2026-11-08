import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, checkHealth, DEFAULT_SERVER_URL, getServerUrl, setServerUrl, ApiError } from './api';
import { KEYS, getItem, setItem } from './storage';
import type { Profile, Summary } from './types';
import { engine } from '../i18n/engine';
import { S } from '../i18n/strings';

type ServerStatus = 'checking' | 'ok' | 'down';

type Ctx = {
  ready: boolean;
  lang: string | null;
  profile: Profile | null;
  summary: Summary | null;
  serverUrl: string;
  serverStatus: ServerStatus;
  adultLearn: boolean;
  setLang: (code: string) => Promise<void>;
  setProfile: (p: Profile | null) => Promise<void>;
  refreshSummary: () => Promise<void>;
  updateServerUrl: (url: string) => Promise<boolean>;
  recheckServer: () => Promise<boolean>;
  setAdultLearn: (v: boolean) => void;
};

const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [lang, setLangState] = useState<string | null>(null);
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [serverUrl, setServerUrlState] = useState(DEFAULT_SERVER_URL);
  const [serverStatus, setServerStatus] = useState<ServerStatus>('checking');
  const [adultLearn, setAdultLearnState] = useState(false);

  /** Saved profile id still waiting to be loaded from the server. */
  const pendingPid = useRef<string | null>(null);

  const recheckServer = useCallback(async () => {
    setServerStatus('checking');
    try {
      await checkHealth();
    } catch {
      setServerStatus('down');
      return false;
    }
    const pid = pendingPid.current;
    if (pid) {
      try {
        setProfileState(await api<Profile>(`/api/profiles/${pid}`));
        pendingPid.current = null;
      } catch (e) {
        // Profile deleted on the server (e.g. database reset): go back to onboarding.
        if (e instanceof ApiError && e.status === 404) {
          pendingPid.current = null;
          await setItem(KEYS.profileId, null);
        }
      }
    }
    setServerStatus('ok');
    return true;
  }, []);

  // boot
  useEffect(() => {
    (async () => {
      const [savedLang, savedPid, savedUrl, savedAdultLearn] = await Promise.all([
        getItem<string | null>(KEYS.lang, null),
        getItem<string | null>(KEYS.profileId, null),
        getItem<string | null>(KEYS.serverUrl, null),
        getItem<boolean>(KEYS.adultLearn, false),
      ]);
      if (savedUrl) {
        setServerUrl(savedUrl);
        setServerUrlState(getServerUrl());
      }
      setAdultLearnState(savedAdultLearn);
      if (savedLang) {
        await engine.setLang(savedLang);
        setLangState(savedLang);
        engine.prefetch(Object.values(S));
      }
      pendingPid.current = savedPid;
      await recheckServer();
      setReady(true);
    })();
  }, [recheckServer]);

  const refreshSummary = useCallback(async () => {
    if (!profile) return;
    try {
      setSummary(await api<Summary>(`/api/summary?profileId=${profile.id}`));
    } catch {
      /* keep old */
    }
  }, [profile]);

  useEffect(() => {
    setSummary(null);
    refreshSummary();
  }, [refreshSummary]);

  const setLang = useCallback(
    async (code: string) => {
      await engine.setLang(code);
      setLangState(code);
      await setItem(KEYS.lang, code);
      engine.prefetch(Object.values(S));
      if (profile) api(`/api/profiles/${profile.id}`, { method: 'PATCH', body: { language: code } }).catch(() => {});
    },
    [profile],
  );

  const setProfile = useCallback(async (p: Profile | null) => {
    pendingPid.current = null;
    setProfileState(p);
    await setItem(KEYS.profileId, p?.id ?? null);
  }, []);

  const updateServerUrl = useCallback(
    async (url: string) => {
      setServerUrl(url);
      setServerUrlState(getServerUrl());
      await setItem(KEYS.serverUrl, getServerUrl());
      return recheckServer();
    },
    [recheckServer],
  );

  const setAdultLearn = useCallback((v: boolean) => {
    setAdultLearnState(v);
    setItem(KEYS.adultLearn, v);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      lang,
      profile,
      summary,
      serverUrl,
      serverStatus,
      adultLearn,
      setLang,
      setProfile,
      refreshSummary,
      updateServerUrl,
      recheckServer,
      setAdultLearn,
    }),
    [ready, lang, profile, summary, serverUrl, serverStatus, adultLearn, setLang, setProfile, refreshSummary, updateServerUrl, recheckServer, setAdultLearn],
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
