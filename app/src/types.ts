export type ShiftType = 'صباح' | 'مساء' | 'ليل';
export type BookingSource = 'استقبال' | 'بوكينج' | 'غير محدد';
export type RoomCategory = 'VIP' | 'عادي';
export type ExcessReason = 'تجاوز العدد' | 'بدون صلاحية' | 'لم يخرج' | '';

export interface StaffRecord {
  name: string;
  bookingCount: number;
  branch: string;
}

export interface MatchedRow {
  employeeName: string;
  branch: string;
  roomUnit: string;
  roomCategory: RoomCategory;
  shift: ShiftType;
  bookingSource: BookingSource;
  priceSAR: number;
  checkInTime: string;
  checkoutDateStr: string;
  creationTime: string;
  bookingNumber: string;
  guestName: string;
  /** Definitive count from ALL STAFF (the truth) */
  staffBookingCount: number;
  /** Total entries found in reports for this employee-branch */
  reportBookingCount: number;
  /** reportBookingCount - staffBookingCount */
  difference: number;
  /** True if this row is beyond the Staff cap */
  isExcess: boolean;
  /** Why this entry is excess */
  excessReason: ExcessReason;
  // --- Pricing ---
  /** Number of nights */
  nights: number;
  /** Price per night (priceSAR / nights) */
  nightlyRate: number;
  /** Minimum nightly price for this room type */
  minPrice: number;
  /** Room type label used for pricing */
  roomTypeLabel: string;
  /** Total shortfall: (minPrice * nights) - priceSAR. Positive = below minimum */
  priceShortfall: number;
  /** Whether this is a monthly booking (28+ nights) */
  isMonthly: boolean;
  /** Whether this booking is part of a merged pair (Andalous only) */
  isMerged: boolean;
  /** Booking number of the paired room in a merge */
  mergedWithBooking: string;
  /** Guest was transferred between rooms — pricing alert excluded */
  isRoomTransfer: boolean;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface StaffFileStats {
  activeEmployees: number;
  dateFrom: string;
  dateTo: string;
}

export interface LogFileStats {
  newBookings: number;
}

export interface ReportFileStats {
  bookings: number;
}

// --- Attendance (TeamAttendanceReport) ---
export type AttendanceDayStatus = 'valid' | 'incomplete' | 'absent' | 'permitted_absence' | 'review_required';

export interface AttendanceDayResult {
  workDateStr: string;
  status: AttendanceDayStatus;
  netHours: number;
  isOrphan: boolean;
  /** true = بصمة ليلية (نسيان دخول) تُحسب حضور */
  orphanNightExit?: boolean;
  overrideAbsent?: boolean;
}

export interface AttendanceFileResult {
  fileName: string;
  employeeName: string;
  period: string;
  /** إجمالي أيام الفترة = حاضر كامل + بصمة غير مكتملة + غياب + إجازة + تحتاج مراجعة */
  totalDaysInPeriod: number;
  /** أيام الحضور فقط = حاضر كامل + بصمة غير مكتملة (لنسبة البصمة) */
  totalWorkDays: number;
  validDays: number;
  incompleteDays: number;
  absentDays: number;
  permittedAbsence: number;
  /** أيام بصمة وحيدة غير ليلية (تحتاج مراجعة يدوية) */
  reviewRequiredDays: number;
  /** صافي الساعات (مجموع min(ActualDuration, 12)) */
  totalNetHours: number;
  /** نسبة الالتزام بالبصمة = (حاضر كامل / إجمالي أيام الحضور) × 100 */
  fingerprintAccuracy: number;
  days: AttendanceDayResult[];
}
