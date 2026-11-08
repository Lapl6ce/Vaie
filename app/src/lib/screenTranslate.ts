/**
 * System-wide screen translation (native module in modules/screen-translate, Android only).
 * Not available in Expo Go: it needs the Vaie development build / APK. `ScreenTranslate` is
 * null there, and the UI explains that instead of crashing.
 */
import { requireOptionalNativeModule } from 'expo';

type ScreenTranslateModule = {
  canDrawOverlays(): boolean;
  openOverlaySettings(): void;
  isRunning(): boolean;
  /** Shows Android's screen-capture consent; resolves true once the bubble is up. */
  start(serverUrl: string, target: string, targetLabel: string): Promise<boolean>;
  setTarget(target: string, targetLabel: string): void;
  stop(): void;
};

export const ScreenTranslate = requireOptionalNativeModule<ScreenTranslateModule>('ScreenTranslate');
