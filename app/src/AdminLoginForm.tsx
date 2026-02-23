import { Mail, LockKeyhole, Settings } from 'lucide-react';

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
    <div
      dir="rtl"
      className="min-h-screen relative flex items-center justify-center px-4 py-8 bg-[var(--adora-bg)]"
    >
      <div className="relative w-full max-w-5xl rounded-[28px] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.12)] bg-[var(--adora-bg-card)] border border-[var(--adora-border)]">
        <div className="relative grid grid-cols-1 lg:grid-cols-2 min-h-[620px]">
          {/* القسم الأيسر بصرياً (في RTL: العمود الثاني) = نموذج الدخول */}
          <div className="flex items-center justify-center p-6 sm:p-10 order-2 lg:order-2">
            <div className="w-full max-w-md">
              <div className="text-center mb-8">
                <div className="inline-flex flex-shrink-0 items-center justify-center mb-3">
                  <img
                    src="/rewards/unnamed.png"
                    alt="إليت"
                    className="w-16 h-16 sm:w-[5.2rem] sm:h-[5.2rem] object-contain rounded-lg"
                    style={{ maxWidth: '104px', maxHeight: '104px' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
                <h3 className="text-2xl sm:text-3xl font-black text-[var(--adora-text)] mb-2">تسجيل دخول الأدمن</h3>
                <p className="text-sm text-[var(--adora-text-secondary)]">استخدم بريد الإدارة للوصول للنظام</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm text-[var(--adora-text-secondary)] mr-1">البريد الإلكتروني</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[var(--adora-text-secondary)] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
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
                      className="w-full pr-10 pl-3 py-3 rounded-xl bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] placeholder:text-[var(--adora-text-secondary)] focus:outline-none focus:border-[var(--adora-accent)] focus:ring-2 focus:ring-[var(--adora-focus-border)] transition-all"
                    />
                  </div>
                  {loginEmailWarning && (
                    <div className="text-[15px] text-[var(--adora-warning)] px-1">{loginEmailWarning}</div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm text-[var(--adora-text-secondary)] mr-1">كلمة المرور</label>
                  <div className="relative">
                    <LockKeyhole className="w-4 h-4 text-[var(--adora-text-secondary)] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="w-full pr-10 pl-20 py-3 rounded-xl bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] placeholder:text-[var(--adora-text-secondary)] focus:outline-none focus:border-[var(--adora-accent)] focus:ring-2 focus:ring-[var(--adora-focus-border)] transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 text-[15px] px-2 py-1 rounded-md bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text-secondary)] hover:bg-[var(--adora-hover-bg)] hover:text-[var(--adora-text)] transition-all"
                    >
                      {showPassword ? 'إخفاء' : 'إظهار'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[15px] text-[var(--adora-text-secondary)]">الجلسة تنتهي بإغلاق المتصفح — لا يُحفظ دخول تلقائي</span>
                  <button
                    type="button"
                    onClick={onOpenReset}
                    className="text-sm font-medium text-[var(--adora-accent)] hover:opacity-90 transition-colors"
                  >
                    نسيت كلمة المرور؟
                  </button>
                </div>

                {authError && (
                  <div className="text-sm text-[var(--adora-error)] bg-[var(--adora-error)]/10 border border-[var(--adora-error)]/40 rounded-lg px-3 py-2">
                    {authError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={loginLoading}
                  className="w-full py-3.5 rounded-xl font-bold bg-[var(--adora-accent)] hover:opacity-90 text-white shadow-md transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loginLoading ? 'جاري تسجيل الدخول...' : 'دخول آمن'}
                </button>
              </div>

              {showReset && (
                <div className="mt-4 p-3 rounded-xl border border-[var(--adora-border)] bg-[var(--adora-input-bg)] space-y-2">
                  <div className="text-sm text-[var(--adora-text-secondary)]">استرجاع كلمة المرور</div>
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
                    className="w-full px-3 py-2 rounded-lg bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] focus:outline-none focus:border-[var(--adora-accent)]"
                  />
                  {resetEmailWarning && (
                    <div className="text-[15px] text-[var(--adora-warning)] px-1">{resetEmailWarning}</div>
                  )}
                  <button
                    type="button"
                    onClick={onResetPassword}
                    className="w-full py-2 rounded-lg text-sm font-bold bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] hover:bg-[var(--adora-hover-bg)] transition-colors"
                  >
                    إرسال رابط الاستعادة
                  </button>
                  {resetStatus && <div className="text-sm text-[var(--adora-text-secondary)]">{resetStatus}</div>}
                </div>
              )}

              <p className="mt-5 text-[15px] text-[var(--adora-text-secondary)] text-center">
                الدخول محمي ويقتصر على الحسابات المصرح بها فقط.
              </p>
            </div>
          </div>

          {/* القسم الأيمن بصرياً (في RTL: العمود الأول) = بوابة إدارة + Elite Rewards */}
          <div className="hidden lg:flex flex-col justify-between p-10 border-r border-[var(--adora-border)] bg-[var(--adora-hover-bg)]/30 order-1 lg:order-1">
            <div>
              <div className="inline-flex items-center gap-2 text-sm font-medium tracking-wide text-white bg-[var(--adora-accent)] rounded-full px-3 py-1.5 mb-4 shadow-sm">
                <Settings className="w-3.5 h-3.5" />
                Secure Admin Access
              </div>
              <h2 className="text-4xl font-black leading-[1.2] text-[var(--adora-text)] mb-4">
                بوابة إدارة
                <span className="block text-[var(--adora-accent)]">Elite Rewards</span>
              </h2>
              <p className="text-sm text-[var(--adora-text-secondary)] leading-7 max-w-sm text-justify">
                المنصة الرائدة لإدارة المكافآت وتحليل الأداء باحترافية وأمان. تجربة سلسة تدمج بين دقة البيانات وخصوصية التحكم، لتطوير منظومة النجاح
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
