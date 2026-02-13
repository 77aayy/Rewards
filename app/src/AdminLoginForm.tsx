import { Mail, LockKeyhole, Sparkles } from 'lucide-react';

export interface AdminLoginFormProps {
  loginEmail: string;
  onLoginEmailChange: (value: string, field: 'login' | 'reset') => void;
  loginPassword: string;
  setLoginPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean | ((prev: boolean) => boolean)) => void;
  loginEmailWarning: string;
  authError: string;
  loginLoading: boolean;
  onSubmit: () => void;
  showReset: boolean;
  onOpenReset: () => void;
  resetEmail: string;
  resetEmailWarning: string;
  resetStatus: string;
  onResetPassword: () => void;
}

export function AdminLoginForm({
  loginEmail,
  onLoginEmailChange,
  loginPassword,
  setLoginPassword,
  showPassword,
  setShowPassword,
  loginEmailWarning,
  authError,
  loginLoading,
  onSubmit,
  showReset,
  onOpenReset,
  resetEmail,
  resetEmailWarning,
  resetStatus,
  onResetPassword,
}: AdminLoginFormProps) {
  return (
    <div dir="rtl" className="min-h-screen text-slate-100 relative flex items-center justify-center px-4 py-8">
      <div className="relative w-full max-w-5xl rounded-3xl overflow-hidden border border-white/20 bg-slate-900/40 backdrop-blur-2xl shadow-[0_25px_80px_rgba(0,0,0,0.45)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(20,184,166,0.2),transparent_35%),radial-gradient(circle_at_20%_80%,rgba(59,130,246,0.15),transparent_35%)] pointer-events-none" />
        <div className="relative grid grid-cols-1 lg:grid-cols-2 min-h-[620px]">
          <div className="hidden lg:flex flex-col justify-between p-10 border-l border-white/10 bg-white/[0.03]">
            <div>
              <div className="inline-flex items-center gap-2 text-xs tracking-wide text-turquoise/90 bg-turquoise/10 border border-turquoise/30 rounded-full px-3 py-1 mb-4">
                <Sparkles className="w-3.5 h-3.5" />
                Secure Admin Access
              </div>
              <h2 className="text-4xl font-black leading-[1.2] text-white mb-4">
                بوابة إدارة
                <span className="block text-turquoise">Elite Rewards</span>
              </h2>
              <p className="text-sm text-slate-300 leading-7 max-w-sm">
                المنصة الرائدة لإدارة المكافآت وتحليل الأداء باحترافية وأمان. تجربة سلسة تدمج بين دقة البيانات وخصوصية التحكم، لتطوير منظومة النجاح
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center p-6 sm:p-10">
            <div className="w-full max-w-md">
              <div className="text-center mb-8">
                <div className="inline-flex flex-shrink-0 items-center justify-center mb-3">
                  <img
                    src="/rewards/unnamed.png"
                    alt="إليت"
                    className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 object-contain rounded-lg"
                    style={{ maxWidth: '80px', maxHeight: '80px' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
                <h3 className="text-2xl sm:text-3xl font-black text-white mb-2">تسجيل دخول الأدمن</h3>
                <p className="text-sm text-slate-300">استخدم بريد الإدارة للوصول للنظام</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-300 mr-1">البريد الإلكتروني</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={(e) => onLoginEmailChange(e.target.value, 'login')}
                      onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
                      onPaste={(e) => {
                        e.preventDefault();
                        const pasted = e.clipboardData.getData('text');
                        onLoginEmailChange(pasted, 'login');
                      }}
                      placeholder="admin@elite.com"
                      autoComplete="email"
                      className="w-full pr-10 pl-3 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-slate-500 focus:outline-none focus:border-[#14b8a6] focus:ring-2 focus:ring-[#14b8a6]/30 transition-all"
                    />
                  </div>
                  {loginEmailWarning && (
                    <div className="text-[11px] text-amber-300/95 px-1">{loginEmailWarning}</div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-300 mr-1">كلمة المرور</label>
                  <div className="relative">
                    <LockKeyhole className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="w-full pr-10 pl-20 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-slate-500 focus:outline-none focus:border-[#14b8a6] focus:ring-2 focus:ring-[#14b8a6]/30 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] px-2 py-1 rounded-md bg-white/10 border border-white/20 text-slate-300 hover:text-white hover:border-[#14b8a6]/40 transition-all"
                    >
                      {showPassword ? 'إخفاء' : 'إظهار'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">الجلسة تنتهي بإغلاق المتصفح — لا يُحفظ دخول تلقائي</span>
                  <button
                    type="button"
                    onClick={onOpenReset}
                    className="text-xs text-turquoise hover:text-white transition-colors"
                  >
                    نسيت كلمة المرور؟
                  </button>
                </div>

                {authError && (
                  <div className="text-xs text-red-200 bg-red-500/15 border border-red-400/40 rounded-lg px-3 py-2">
                    {authError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={loginLoading}
                  className="w-full py-3.5 rounded-xl font-bold bg-gradient-to-r from-[#14b8a6] to-cyan-500 hover:from-[#0ea5a5] hover:to-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loginLoading ? 'جاري تسجيل الدخول...' : 'دخول آمن'}
                </button>
              </div>

              {showReset && (
                <div className="mt-4 p-3 rounded-xl border border-white/15 bg-white/5 space-y-2">
                  <div className="text-xs text-slate-300">استرجاع كلمة المرور</div>
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => onLoginEmailChange(e.target.value, 'reset')}
                    onPaste={(e) => {
                      e.preventDefault();
                      const pasted = e.clipboardData.getData('text');
                      onLoginEmailChange(pasted, 'reset');
                    }}
                    placeholder="اكتب الإيميل لإرسال رابط الاستعادة"
                    className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-[#14b8a6]"
                  />
                  {resetEmailWarning && (
                    <div className="text-[11px] text-amber-300/95 px-1">{resetEmailWarning}</div>
                  )}
                  <button
                    type="button"
                    onClick={onResetPassword}
                    className="w-full py-2 rounded-lg text-sm font-bold bg-white/10 border border-white/20 hover:bg-[#14b8a6]/20"
                  >
                    إرسال رابط الاستعادة
                  </button>
                  {resetStatus && <div className="text-xs text-slate-200">{resetStatus}</div>}
                </div>
              )}

              <p className="mt-5 text-[11px] text-slate-500 text-center">
                الدخول محمي ويقتصر على الحسابات المصرح بها فقط.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
