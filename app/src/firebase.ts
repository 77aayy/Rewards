/**
 * Firebase Storage integration for persisting AppConfig across devices.
 * Uses the same Firebase project as the Rewards app (rewards-63e43).
 * Config is saved to: config/settings.json
 *
 * مصدر الحقيقة: adminConfig.ts (يدعم .env). راجع SECURITY.md.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getStorage, ref, uploadBytes, getBlob, type FirebaseStorage } from 'firebase/storage';
import type { AppConfig } from './config';
import { FIREBASE_CONFIG } from './adminConfig';

const CONFIG_PATH = 'config/settings.json';
const FIREBASE_CONFIG_SAVED_KEY = 'adora_firebase_config_saved';

let app: FirebaseApp | null = null;
let storage: FirebaseStorage | null = null;

function getFirebaseStorage(): FirebaseStorage {
  if (!storage) {
    app = initializeApp(FIREBASE_CONFIG, 'adora-config');
    storage = getStorage(app);
  }
  return storage;
}

/**
 * Save AppConfig to Firebase Storage (background, non-blocking).
 * Silently fails — localStorage is always the primary source of truth.
 */
export async function saveConfigToFirebase(config: AppConfig): Promise<void> {
  try {
    const st = getFirebaseStorage();
    const blob = new Blob([JSON.stringify(config)], { type: 'application/json' });
    await uploadBytes(ref(st, CONFIG_PATH), blob);
    if (typeof localStorage !== 'undefined') localStorage.setItem(FIREBASE_CONFIG_SAVED_KEY, '1');
  } catch (e) {
    console.warn('⚠️ Firebase config save failed (non-critical):', e);
  }
}

/**
 * Load AppConfig from Firebase Storage.
 * Returns null if not found or on error.
 * @param options.forceFetch — when true, try Firebase even without adora_firebase_config_saved
 *   (used on new device when localStorage is empty, to fetch config saved from another device).
 */
export async function loadConfigFromFirebase(options?: { forceFetch?: boolean }): Promise<AppConfig | null> {
  try {
    const skipGuard = options?.forceFetch === true;
    if (!skipGuard && typeof localStorage !== 'undefined' && !localStorage.getItem(FIREBASE_CONFIG_SAVED_KEY)) {
      return null;
    }
    const st = getFirebaseStorage();
    const blob = await getBlob(ref(st, CONFIG_PATH));
    const text = await blob.text();
    const parsed = JSON.parse(text) as AppConfig;
    if (parsed && typeof parsed.minBookingThreshold === 'number' && parsed.rewardPricing) {
      if (typeof localStorage !== 'undefined') localStorage.setItem(FIREBASE_CONFIG_SAVED_KEY, '1');
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
