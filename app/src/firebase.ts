/**
 * Firebase Storage integration for persisting AppConfig across devices.
 * Uses the same Firebase project as the Rewards app (rewards-63e43).
 * Config is saved to: config/settings.json
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getStorage, ref, uploadBytes, getBlob, type FirebaseStorage } from 'firebase/storage';
import type { AppConfig } from './config';

// ── Firebase config (same project as Rewards app) ──
const firebaseConfig = {
  apiKey: 'AIzaSyAKpUAnc_EJXxGrhPPfTAgnFB13Qvs_ogk',
  authDomain: 'rewards-63e43.firebaseapp.com',
  projectId: 'rewards-63e43',
  storageBucket: 'rewards-63e43.firebasestorage.app',
  messagingSenderId: '453256410249',
  appId: '1:453256410249:web:b7edd6afe3922c3e738258',
};

const CONFIG_PATH = 'config/settings.json';
const FIREBASE_CONFIG_SAVED_KEY = 'adora_firebase_config_saved';

let app: FirebaseApp | null = null;
let storage: FirebaseStorage | null = null;

function getFirebaseStorage(): FirebaseStorage {
  if (!storage) {
    app = initializeApp(firebaseConfig, 'adora-config');
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
 * Skips the request (avoids 404) when no one has saved config to Firebase yet.
 */
export async function loadConfigFromFirebase(): Promise<AppConfig | null> {
  try {
    if (typeof localStorage !== 'undefined' && !localStorage.getItem(FIREBASE_CONFIG_SAVED_KEY)) {
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
