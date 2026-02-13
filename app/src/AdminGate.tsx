import type { FormEvent } from 'react';

interface AdminGateProps {
  gateKey: string;
  setGateKey: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
}

export function AdminGate({ gateKey, setGateKey, onSubmit }: AdminGateProps) {
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
              onChange={(e) => setGateKey(e.target.value)}
              placeholder="أدخل المفتاح"
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-slate-500 focus:outline-none focus:border-[#14b8a6] focus:ring-2 focus:ring-[#14b8a6]/30"
            />
          </div>
          <button type="submit" className="w-full py-3 rounded-xl font-bold bg-[#14b8a6] hover:bg-[#0ea5a5] text-slate-950 transition-colors">
            دخول
          </button>
        </form>
      </div>
    </div>
  );
}
