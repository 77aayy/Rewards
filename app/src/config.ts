// ===================================================================
// Dynamic Configuration — Pricing, Branches, Thresholds
// All values that were previously hardcoded are now configurable.
// Persisted in localStorage under key "adora-analysis-config".
//
// إعدادات عامة للمشروع: لا ترتبط بفترة ولا تُستبدل عند تغيير الفترة أو
// إغلاقها أو رفع ملفات جديدة أو مزامنة Firebase. التخزين بمفتاح ثابت فقط.
// ===================================================================

/** Minimum nightly price for a room type (daily vs monthly) */
export interface RoomPriceRule {
  /** Display label for the room type */
  roomType: string;
  /** Min nightly rate for daily stays */
  dailyMin: number;
  /** Min nightly rate for monthly stays (28+ nights) */
  monthlyMin: number;
  /** Keywords to match in the room unit text (Arabic) */
  keywords: string[];
}

/** Merged-room pricing (Andalous-style paired rooms) */
export interface MergedRoomRule {
  label: string;
  dailyMin: number;
  monthlyMin: number;
  /** Pair pattern: last digits of rooms, e.g. [1,2] for x01+x02 */
  digitPairs: [number, number];
}

/** Per-branch configuration */
export interface BranchConfig {
  /** Branch display name (e.g. "الكورنيش") */
  name: string;
  /** Whether this branch is excluded from analysis */
  excluded: boolean;
  /** VIP room numbers for this branch */
  vipRooms: string[];
  /** Pricing rules for this branch */
  priceRules: RoomPriceRule[];
  /** Merged room rules (optional, for branches like Andalous) */
  mergedRules: MergedRoomRule[];
}

/** VIP rate split by booking source (reception vs booking.com) */
export interface VipSourceRate {
  /** ريال لكل حجز VIP عن طريق الاستقبال */
  reception: number;
  /** ريال لكل حجز VIP عن طريق بوكينج */
  booking: number;
}

/** Reward pricing — rates multiplied by counts to compute employee gross reward */
export interface RewardPricing {
  /** ريال لكل حجز شفت صباح (استقبال عادي فقط، غير VIP) */
  rateMorning: number;
  /** ريال لكل حجز شفت مساء (استقبال عادي فقط) */
  rateEvening: number;
  /** ريال لكل حجز شفت ليل (استقبال عادي فقط) */
  rateNight: number;
  /** ريال لكل حجز بوكينج عادي (غير VIP) — قيمة ثابتة لكل الشفتات */
  rateBooking: number;
  /** ريال لكل عقد شهري (قائمة الأسعار) */
  rateContract: number;
  /** سعر VIP لكل غرفة حسب الفرع — key = اسم الفرع, value = { رقم الغرفة: { reception, booking } } */
  rateVipByBranch: Record<string, Record<string, VipSourceRate>>;
  /** سعر VIP افتراضي لغرف لم تُحدد */
  rateVipDefault: VipSourceRate;
  /** نص توضيحي لحجوزات VIP (يظهر في شروط المكافآت) */
  vipDescription: string;
  /** ريال لكل تقييم Booking */
  rateEvalBooking: number;
  /** ريال لكل تقييم Google Maps */
  rateEvalGoogle: number;
  /** حد التقييم الأدنى للفندق — الكورنيش */
  minEvalCorniche: number;
  /** حد التقييم الأدنى للفندق — الأندلس */
  minEvalAndalus: number;
  /** حد التقييم الأدنى — خرائط جوجل */
  minEvalGoogle: number;
  /** نسبة صندوق الدعم من الإجمالي (0–100). الصافي = الإجمالي − (الإجمالي × supportFundPercent / 100) */
  supportFundPercent: number;
}

/** Full application config */
export interface AppConfig {
  /** Minimum combined bookings for an employee to be included */
  minBookingThreshold: number;
  /** Number of nights to consider a booking "monthly" */
  monthlyNightsThreshold: number;
  /** Per-branch configs, keyed by branch name */
  branches: Record<string, BranchConfig>;
  /** أسعار مكافآت الموظفين — تُستخدم في حساب الصافي */
  rewardPricing: RewardPricing;
}

// ===================================================================
// القيم الافتراضية — تُستخدم عند أول تحميل أو عند «استعادة الافتراضي»
// (ما لم يكن قد تم «حفظ كافتراضي» من لوحة الإعدادات).
// ===================================================================
// القيم الافتراضية للإعدادات — تظهر في لوحة الإعدادات عند عدم وجود حفظ سابق،
// وعند الضغط على «استعادة الافتراضي». لتعديلها: عدّل DEFAULT_CONFIG و DEFAULT_REWARD_PRICING أدناه،
// أو من اللوحة اضغط «حفظ كافتراضي» بعد ضبط القيم (يُخزّن في المتصفح فقط).
// ===================================================================

const DEFAULT_CORNICHE: BranchConfig = {
  name: 'الكورنيش',
  excluded: false,
  vipRooms: ['603', '604'],
  priceRules: [
    { roomType: 'VIP', dailyMin: 850, monthlyMin: 600, keywords: ['vip'] },
    { roomType: 'تؤم', dailyMin: 230, monthlyMin: 187, keywords: ['تؤم', 'تؤام'] },
    { roomType: 'كينج', dailyMin: 230, monthlyMin: 187, keywords: ['كينج', 'king'] },
    { roomType: 'ستوديو', dailyMin: 340, monthlyMin: 260, keywords: ['ستوديو', 'studio'] },
    { roomType: 'غرفة وصالة', dailyMin: 370, monthlyMin: 280, keywords: ['صالة', 'النوم'] },
    { roomType: 'غرفتين', dailyMin: 400, monthlyMin: 300, keywords: ['غرفتين', 'شقة غرفتين'] },
  ],
  mergedRules: [],
};

const DEFAULT_ANDALOUS: BranchConfig = {
  name: 'الأندلس',
  excluded: false,
  vipRooms: ['601', '602', '603', '604'],
  priceRules: [
    { roomType: 'VIP-601', dailyMin: 570, monthlyMin: 467, keywords: ['vip'] },
    { roomType: 'VIP-602', dailyMin: 370, monthlyMin: 333, keywords: ['vip'] },
    { roomType: 'VIP-604', dailyMin: 320, monthlyMin: 267, keywords: ['vip'] },
    { roomType: 'تؤام', dailyMin: 190, monthlyMin: 169, keywords: ['تؤام', 'تؤم'] },
    { roomType: 'كينج', dailyMin: 205, monthlyMin: 180, keywords: ['كينج', 'king'] },
    { roomType: 'ستوديو', dailyMin: 220, monthlyMin: 192, keywords: ['ستوديو', 'studio'] },
    { roomType: 'جناح', dailyMin: 290, monthlyMin: 245, keywords: ['جناح', 'صال'] },
  ],
  mergedRules: [
    { label: 'غرفتين أمامية', dailyMin: 420, monthlyMin: 345, digitPairs: [1, 2] },
    { label: 'غرفتين خلفية', dailyMin: 390, monthlyMin: 322, digitPairs: [3, 4] },
    { label: 'غرفتين خلفية', dailyMin: 390, monthlyMin: 322, digitPairs: [5, 6] },
    { label: 'غرفتين أمامية', dailyMin: 420, monthlyMin: 345, digitPairs: [7, 8] },
  ],
};

export const DEFAULT_REWARD_PRICING: RewardPricing = {
  rateMorning: 2,
  rateEvening: 3,
  rateNight: 4,
  rateBooking: 2,
  rateContract: 200,
  rateVipByBranch: {
    'الكورنيش': { '603': { reception: 30, booking: 3 }, '604': { reception: 30, booking: 3 } },
    'الأندلس': {
      '601': { reception: 30, booking: 3 },
      '602': { reception: 30, booking: 3 },
      '603': { reception: 30, booking: 3 },
      '604': { reception: 10, booking: 2 },
    },
  },
  rateVipDefault: { reception: 30, booking: 3 },
  vipDescription: 'الحد الادني لعدد الحجوزات = شفت الليل 75 عقد باقي الشفتات 120 عقد',
  rateEvalBooking: 30,
  rateEvalGoogle: 10,
  minEvalCorniche: 8.7,
  minEvalAndalus: 8.2,
  minEvalGoogle: 4.3,
  supportFundPercent: 15,
};

/** الافتراضي المعتمد: الحدود العامة + أسعار المكافآت. تُستعمل عند فتح الإعدادات أول مرة وعند «استعادة الافتراضي». */
export const DEFAULT_CONFIG: AppConfig = {
  minBookingThreshold: 10,
  monthlyNightsThreshold: 28,
  branches: {
    'الكورنيش': DEFAULT_CORNICHE,
    'الأندلس': DEFAULT_ANDALOUS,
  },
  rewardPricing: structuredClone(DEFAULT_REWARD_PRICING),
};

// ===================================================================
// localStorage persistence
// ===================================================================

const STORAGE_KEY = 'adora-analysis-config';
const STORAGE_KEY_DEFAULT = 'adora-analysis-default-config';
const REWARDS_PRICING_KEY = 'adora_rewards_pricing';

/** Try to load rewardPricing from Rewards app storage (when returning from rewards) */
function loadRewardsPricingFallback(): Partial<RewardPricing> | null {
  try {
    const raw = localStorage.getItem(REWARDS_PRICING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as Partial<RewardPricing>;
  } catch {
    return null;
  }
}

/** Merge rewards-app pricing into base, preserving valid numeric fields */
function mergeRewardPricing(base: RewardPricing, overlay: Partial<RewardPricing>): RewardPricing {
  const vipDefault =
    overlay.rateVipDefault != null
      ? typeof overlay.rateVipDefault === 'number'
        ? { reception: overlay.rateVipDefault, booking: overlay.rateVipDefault }
        : {
            reception: (overlay.rateVipDefault as VipSourceRate).reception ?? base.rateVipDefault.reception,
            booking: (overlay.rateVipDefault as VipSourceRate).booking ?? base.rateVipDefault.booking,
          }
      : base.rateVipDefault;
  let vipByBranch = base.rateVipByBranch;
  if (overlay.rateVipByBranch && typeof overlay.rateVipByBranch === 'object') {
    vipByBranch = { ...base.rateVipByBranch };
    for (const [branch, rooms] of Object.entries(overlay.rateVipByBranch)) {
      if (rooms && typeof rooms === 'object') {
        vipByBranch[branch] = { ...(vipByBranch[branch] || {}) };
        for (const [room, val] of Object.entries(rooms as Record<string, unknown>)) {
          if (typeof val === 'number') {
            vipByBranch[branch][room] = { reception: val, booking: val };
          } else if (val && typeof val === 'object') {
            vipByBranch[branch][room] = {
              reception: (val as VipSourceRate).reception ?? 0,
              booking: (val as VipSourceRate).booking ?? 0,
            };
          }
        }
      }
    }
  }
  return {
    rateMorning: typeof overlay.rateMorning === 'number' ? overlay.rateMorning : base.rateMorning,
    rateEvening: typeof overlay.rateEvening === 'number' ? overlay.rateEvening : base.rateEvening,
    rateNight: typeof overlay.rateNight === 'number' ? overlay.rateNight : base.rateNight,
    rateBooking: typeof overlay.rateBooking === 'number' ? overlay.rateBooking : base.rateBooking,
    rateContract: typeof overlay.rateContract === 'number' ? overlay.rateContract : (base as RewardPricing).rateContract ?? 200,
    rateVipByBranch: vipByBranch,
    rateVipDefault: vipDefault,
    vipDescription: typeof overlay.vipDescription === 'string' ? overlay.vipDescription : (base as RewardPricing).vipDescription ?? 'حجوزات VIP — تُسعّر من خانات VIP (استقبال/بوكينج لكل غرفة)',
    rateEvalBooking: typeof overlay.rateEvalBooking === 'number' ? overlay.rateEvalBooking : base.rateEvalBooking,
    rateEvalGoogle: typeof overlay.rateEvalGoogle === 'number' ? overlay.rateEvalGoogle : base.rateEvalGoogle,
    minEvalCorniche: typeof overlay.minEvalCorniche === 'number' ? overlay.minEvalCorniche : (base as RewardPricing).minEvalCorniche ?? 8.7,
    minEvalAndalus: typeof overlay.minEvalAndalus === 'number' ? overlay.minEvalAndalus : (base as RewardPricing).minEvalAndalus ?? 8.2,
    minEvalGoogle: typeof overlay.minEvalGoogle === 'number' ? overlay.minEvalGoogle : (base as RewardPricing).minEvalGoogle ?? 4.3,
    supportFundPercent: typeof overlay.supportFundPercent === 'number' ? overlay.supportFundPercent : (base as RewardPricing).supportFundPercent ?? 15,
  };
}

/** Returns true if localStorage has a saved config (not first-time/new device) */
export function hasLocalConfig(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/** حفظ الإعدادات الحالية كافتراضي — تُستعاد عند «استعادة الافتراضي» في لوحة الإعدادات */
export function saveDefaultConfig(config: AppConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY_DEFAULT, JSON.stringify(config));
  } catch {
    /* ignore */
  }
}

/** قراءة الافتراضي المحفوظ؛ إن لم يوجد يُرجع null (لوحة الإعدادات تستخدم الإعدادات الحالية بدلاً منه) */
export function getDefaultConfig(): AppConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DEFAULT);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppConfig;
    if (!parsed || typeof parsed !== 'object') return null;
    return structuredClone(parsed) as AppConfig;
  } catch {
    return null;
  }
}

export function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const base = structuredClone(DEFAULT_CONFIG);
      const rewardsPricing = loadRewardsPricingFallback();
      if (rewardsPricing && typeof rewardsPricing.rateMorning === 'number') {
        base.rewardPricing = mergeRewardPricing(base.rewardPricing, rewardsPricing);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(base)); } catch { /* ignore */ }
      }
      return base;
    }
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    const branches = parsed.branches ?? structuredClone(DEFAULT_CONFIG.branches);
    // Ensure each branch has excluded preserved (user choice "اخفاء الفرع" persists)
    const branchesWithExcluded: Record<string, BranchConfig> = {};
    for (const [name, bc] of Object.entries(branches)) {
      const def = DEFAULT_CONFIG.branches[name];
      branchesWithExcluded[name] = {
        name: bc.name ?? name,
        excluded: bc.excluded ?? def?.excluded ?? false,
        vipRooms: bc.vipRooms ?? def?.vipRooms ?? [],
        priceRules: bc.priceRules ?? def?.priceRules ?? [],
        mergedRules: bc.mergedRules ?? def?.mergedRules ?? [],
      };
    }
    const savedPricing = parsed.rewardPricing;
    // Migrate old rateVipDefault (number) to new { reception, booking } shape
    let vipDefault = DEFAULT_REWARD_PRICING.rateVipDefault;
    if (savedPricing?.rateVipDefault != null) {
      if (typeof savedPricing.rateVipDefault === 'number') {
        // Legacy: single number → use for both
        vipDefault = { reception: savedPricing.rateVipDefault, booking: savedPricing.rateVipDefault };
      } else {
        vipDefault = {
          reception: (savedPricing.rateVipDefault as VipSourceRate).reception ?? 0,
          booking: (savedPricing.rateVipDefault as VipSourceRate).booking ?? 0,
        };
      }
    }
    // Migrate old rateVipByBranch (Record<string, Record<string, number>>) to new shape
    const vipByBranch: Record<string, Record<string, VipSourceRate>> = {};
    if (savedPricing?.rateVipByBranch) {
      for (const [branch, rooms] of Object.entries(savedPricing.rateVipByBranch)) {
        vipByBranch[branch] = {};
        for (const [room, val] of Object.entries(rooms as Record<string, unknown>)) {
          if (typeof val === 'number') {
            // Legacy: single number → use for both
            vipByBranch[branch][room] = { reception: val, booking: val };
          } else if (val && typeof val === 'object') {
            vipByBranch[branch][room] = {
              reception: (val as VipSourceRate).reception ?? 0,
              booking: (val as VipSourceRate).booking ?? 0,
            };
          }
        }
      }
    }
    const rewardPricing: RewardPricing = {
      rateMorning: savedPricing?.rateMorning ?? DEFAULT_REWARD_PRICING.rateMorning,
      rateEvening: savedPricing?.rateEvening ?? DEFAULT_REWARD_PRICING.rateEvening,
      rateNight: savedPricing?.rateNight ?? DEFAULT_REWARD_PRICING.rateNight,
      rateBooking: savedPricing?.rateBooking ?? DEFAULT_REWARD_PRICING.rateBooking,
      rateContract: savedPricing?.rateContract ?? DEFAULT_REWARD_PRICING.rateContract,
      rateVipByBranch: vipByBranch,
      rateVipDefault: vipDefault,
      vipDescription: savedPricing?.vipDescription ?? DEFAULT_REWARD_PRICING.vipDescription,
      rateEvalBooking: savedPricing?.rateEvalBooking ?? DEFAULT_REWARD_PRICING.rateEvalBooking,
      rateEvalGoogle: savedPricing?.rateEvalGoogle ?? DEFAULT_REWARD_PRICING.rateEvalGoogle,
    minEvalCorniche: savedPricing?.minEvalCorniche ?? DEFAULT_REWARD_PRICING.minEvalCorniche,
    minEvalAndalus: savedPricing?.minEvalAndalus ?? DEFAULT_REWARD_PRICING.minEvalAndalus,
    minEvalGoogle: savedPricing?.minEvalGoogle ?? DEFAULT_REWARD_PRICING.minEvalGoogle,
    supportFundPercent: typeof savedPricing?.supportFundPercent === 'number' ? savedPricing.supportFundPercent : DEFAULT_REWARD_PRICING.supportFundPercent,
  };
    return {
      minBookingThreshold: parsed.minBookingThreshold ?? DEFAULT_CONFIG.minBookingThreshold,
      monthlyNightsThreshold: parsed.monthlyNightsThreshold ?? DEFAULT_CONFIG.monthlyNightsThreshold,
      branches: branchesWithExcluded,
      rewardPricing,
    };
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

export function saveConfig(config: AppConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    // Keep Rewards app in sync (reads from adora_rewards_pricing)
    localStorage.setItem(REWARDS_PRICING_KEY, JSON.stringify(config.rewardPricing));
  } catch {
    // localStorage might be full or disabled — silently ignore
  }
  // Intentionally local-only during analysis flow.
  // Firebase sync is triggered from the transfer-to-rewards flow.
}

// ===================================================================
// Helper: ensure a discovered branch has a config entry
// ===================================================================

export function ensureBranchConfig(config: AppConfig, branchName: string): AppConfig {
  if (config.branches[branchName]) return config;
  // Newly discovered branch: "مستبعد" enabled by default — user can disable before upload if needed
  return {
    ...config,
    branches: {
      ...config.branches,
      [branchName]: {
        name: branchName,
        excluded: true,
        vipRooms: [],
        priceRules: [],
        mergedRules: [],
      },
    },
  };
}

// ===================================================================
// Helper: get min price for a room in a branch using config
// ===================================================================

export function getMinPriceFromConfig(
  config: AppConfig,
  branch: string,
  roomUnit: string,
  roomNum: string,
  nights: number,
): { label: string; minPrice: number; isMonthly: boolean } {
  const bc = config.branches[branch];
  if (!bc || !roomUnit) return { label: 'غير محدد', minPrice: 0, isMonthly: false };

  const lower = roomUnit.toLowerCase();
  const isMonthly = nights >= config.monthlyNightsThreshold;

  // Special VIP handling for branches with per-room VIP pricing (like Andalous)
  if (lower.includes('vip')) {
    // Look for room-specific VIP rule first
    const specific = bc.priceRules.find(
      (r) => r.roomType.includes(roomNum) && r.keywords.some((k) => lower.includes(k)),
    );
    if (specific) {
      return {
        label: specific.roomType + (isMonthly ? ' (شهري)' : ''),
        minPrice: isMonthly ? specific.monthlyMin : specific.dailyMin,
        isMonthly,
      };
    }
    // Generic VIP fallback
    const generic = bc.priceRules.find((r) => r.roomType === 'VIP' || r.roomType.startsWith('VIP'));
    if (generic) {
      return {
        label: 'VIP' + (isMonthly ? ' (شهري)' : ''),
        minPrice: isMonthly ? generic.monthlyMin : generic.dailyMin,
        isMonthly,
      };
    }
    return { label: 'VIP', minPrice: 0, isMonthly };
  }

  // Match non-VIP by keywords (order matters — first match wins, more specific first)
  // We skip VIP rules when matching non-VIP rooms
  for (const rule of bc.priceRules) {
    if (rule.roomType.startsWith('VIP')) continue;
    if (rule.keywords.some((k) => lower.includes(k))) {
      return {
        label: rule.roomType + (isMonthly ? ' (شهري)' : ''),
        minPrice: isMonthly ? rule.monthlyMin : rule.dailyMin,
        isMonthly,
      };
    }
  }

  return { label: 'غير مصنف', minPrice: 0, isMonthly: false };
}

// ===================================================================
// Helper: get merged room type from config
// ===================================================================

export function getMergedTypeFromConfig(
  config: AppConfig,
  branch: string,
  roomNum1: string,
  roomNum2: string,
): { mergeType: string; dailyMin: number; monthlyMin: number } | null {
  const bc = config.branches[branch];
  if (!bc) return null;

  const n1 = parseInt(roomNum1, 10);
  const n2 = parseInt(roomNum2, 10);
  if (isNaN(n1) || isNaN(n2)) return null;
  // Skip VIP floor (6xx)
  if (Math.floor(n1 / 100) === 6 || Math.floor(n2 / 100) === 6) return null;
  // Must be same floor
  if (Math.floor(n1 / 100) !== Math.floor(n2 / 100)) return null;

  const sorted = [n1 % 10, n2 % 10].sort((a, b) => a - b);

  for (const rule of bc.mergedRules) {
    const [d1, d2] = rule.digitPairs;
    if (sorted[0] === d1 && sorted[1] === d2) {
      return { mergeType: rule.label, dailyMin: rule.dailyMin, monthlyMin: rule.monthlyMin };
    }
    // Also check reversed pairs like [5,6] and [7,8]
  }

  // Hardcoded fallback pairs (common hotel patterns)
  const pairMap: Record<string, string> = {};
  for (const rule of bc.mergedRules) {
    pairMap[`${rule.digitPairs[0]},${rule.digitPairs[1]}`] = rule.label;
  }

  return null;
}
