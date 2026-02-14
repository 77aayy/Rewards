import { useState, useCallback } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';

interface AdminGateProps {
  gateKey: string;
  setGateKey: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
}

const hasArabic = (s: string) => /[\u0600-\u06FF]/.test(s);

export function AdminGate({ gateKey, setGateKey, onSubmit }: AdminGateProps) {
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [showCapsWarning, setShowCapsWarning] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    const caps = e.getModifierState?.('CapsLock');
    setCapsLockOn(!!caps);
    if (caps) setShowCapsWarning(true);
  }, []);

  const handleKeyUp = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    setCapsLockOn(!!e.getModifierState?.('CapsLock'));
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setGateKey(e.target.value);
  }, [setGateKey]);

  const arabicInKey = hasArabic(gateKey);

  return (
    <div dir="rtl" className="min-h-screen text-slate-100 relative flex items-center justify-center px-4 py-8">
      <div className="glass rounded-2xl border border-white/15 p-6 sm:p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <img
            src="/rewards/unnamed.png"
            alt="إليت"
            className="w-14 h-14 sm:w-16 sm:h-16 object-contain rounded-lg mx-auto mb-3"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <h2 className="text-xl font-black text-turquoise mb-2">بوابة الإدارة</h2>
          <p className="text-sm text-slate-300">أدخل مفتاح الدخول ثم ستظهر لك صفحة تسجيل الدخول (البريد وكلمة المرور).</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-slate-300 block mb-1">مفتاح بوابة الإدارة</label>
            <input
              type="text"
              dir="ltr"
              autoComplete="off"
              value={gateKey}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onKeyUp={handleKeyUp}
              onBlur={() => setShowCapsWarning(false)}
              placeholder="أدخل المفتاح"
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-slate-500 focus:outline-none focus:border-[#14b8a6] focus:ring-2 focus:ring-[#14b8a6]/30"
            />
            {showCapsWarning && capsLockOn && (
              <p className="mt-1.5 text-amber-400 text-xs flex items-center gap-1.5" role="alert">
                <span aria-hidden>⚠️</span>
                <span>الكابتل لوك (Caps Lock) مفعّل — قد يكون المفتاح بحروف صغيرة.</span>
              </p>
            )}
            {arabicInKey && (
              <p className="mt-1.5 text-amber-400 text-xs flex items-center gap-1.5" role="alert">
                <span aria-hidden>⚠️</span>
                <span>يبدو أنك أدخلت حروفاً عربية. المفتاح عادة بالإنجليزي من الرابط.</span>
              </p>
            )}
          </div>
          <button type="submit" className="w-full py-3 rounded-xl font-bold bg-[#14b8a6] hover:bg-[#0ea5a5] text-slate-950 transition-colors">
            دخول
          </button>
        </form>
      </div>
    </div>
  );
}
