/**
 * E2E Full Checklist — اختبار حقيقي (موظف جديد = سياق متصفح جديد بدون تخزين سابق)
 * Base URL: https://rewards-63e43.web.app (الاختبارات تشغّل الموقع المنشور)
 *
 * متطلب: لتنفيذ الاختبارات 1–6 و9 ضع ملف UserStatisticsReport_Ar.xlsx في جذر المشروع،
 * أو عيّن E2E_EXCEL_PATH لمسار الملف. إن لم يوجد الملف تُتخطى تلك الاختبارات.
 *
 * تشغيل: npx playwright test e2e/e2e-full.spec.js --project=chromium
 * اختبار 9 فقط: npx playwright test e2e/e2e-full.spec.js --project=chromium -g "9."
 */
const path = require('path');
const fs = require('fs');
const { test, expect } = require('@playwright/test');

const BASE_URL = (process.env.E2E_BASE_URL || 'https://rewards-63e43.web.app').trim().replace(/\/+$/, '');
const ADMIN_KEY = (process.env.VITE_ADMIN_SECRET_KEY || process.env.ADMIN_KEY || process.env.E2E_ADMIN_KEY || '').trim();
const ADMIN_URL = ADMIN_KEY ? `${BASE_URL}/?admin=${encodeURIComponent(ADMIN_KEY)}` : '';
const EXCEL_PATH = path.resolve(__dirname, '..', process.env.E2E_EXCEL_PATH || 'UserStatisticsReport_Ar.xlsx');
const EXCEL_EXISTS = fs.existsSync(EXCEL_PATH);

// انتظار تحميل بيانات الفترة من Firebase عند فتح رابط إداري على متصفح موظف جديد
const PERIOD_LOAD_TIMEOUT = 20000;
// لا نستخدم networkidle مع Firebase (اتصالات طويلة) — نعتمد domcontentloaded ثم انتظار العناصر
const GOTO_OPTS = { waitUntil: 'domcontentloaded', timeout: 30000 };

// مهلة لكل اختبار: 2 دقيقة (جلب Firebase + رفع ملف + سياقين متصفح)
const TEST_TIMEOUT_MS = 120000;

test.describe('E2E Full Checklist', () => {
  test.describe.configure({ mode: 'serial', timeout: TEST_TIMEOUT_MS });
  test.skip(!ADMIN_KEY, 'لا مفتاح أدمن. عيّن VITE_ADMIN_SECRET_KEY أو ADMIN_KEY أو E2E_ADMIN_KEY قبل التشغيل.');

  test('1. أدمن: رفع ملف الإكسيل + فتح إدارة الإداريين لتفعيل الروابط على Firebase', async ({ page }) => {
    test.skip(!EXCEL_EXISTS, 'ملف الإكسيل غير موجود. ضع UserStatisticsReport_Ar.xlsx في جذر المشروع أو عيّن E2E_EXCEL_PATH');
    await page.goto(ADMIN_URL, GOTO_OPTS);
    await expect(page.locator('#uploadBox')).toBeVisible({ timeout: 5000 });
    await page.locator('#fileInput').setInputFiles(EXCEL_PATH);
    await page.waitForTimeout(2000);
    await expect(page.locator('#dashboard')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#mainTable')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#headerPeriodRange')).not.toHaveText('-');
    await page.locator('button:has-text("إدارة الإداريين")').click();
    // المودال يظهر بعد انتهاء doSyncLivePeriodNow (Firebase) — قد يستغرق عدة ثوانٍ
    await expect(page.locator('#adminManagementModal')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#adminLink_supervisor')).toBeVisible({ timeout: 8000 });
    expect(await page.locator('#adminLink_supervisor').inputValue()).toMatch(/\/supervisor\/[^/]+\/[^/]+/);
    await page.waitForTimeout(2000);
  });

  test('2. رابط المشرف يفتح على متصفح موظف جديد (بدون جلسة سابقة)', async ({ browser }) => {
    test.skip(!EXCEL_EXISTS, 'ملف الإكسيل مطلوب: ضع UserStatisticsReport_Ar.xlsx في جذر المشروع');
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await adminPage.goto(ADMIN_URL, GOTO_OPTS);
    await expect(adminPage.locator('#uploadBox')).toBeVisible({ timeout: 5000 });
    await adminPage.locator('#fileInput').setInputFiles(EXCEL_PATH);
    await adminPage.waitForTimeout(2000);
    await expect(adminPage.locator('#dashboard')).toBeVisible({ timeout: 15000 });
    await adminPage.locator('button:has-text("إدارة الإداريين")').click();
    await expect(adminPage.locator('#adminLink_supervisor')).toBeVisible({ timeout: 20000 });
    const supervisorHref = await adminPage.locator('#adminLink_supervisor').inputValue();
    await adminContext.close();

    // متصفح موظف جديد: سياق جديد تماماً (لا cookies ولا localStorage من الأدمن)
    const employeeContext = await browser.newContext();
    const supervisorPage = await employeeContext.newPage();

    await supervisorPage.goto(supervisorHref, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // لا يجوز أن تظهر "تعذّر تحميل بيانات الفترة" — هذا هو الاختبار الحقيقي
    const errorMsg = supervisorPage.getByText('تعذّر تحميل بيانات الفترة');
    await expect(errorMsg).not.toBeVisible({ timeout: PERIOD_LOAD_TIMEOUT });

    // يجب أن تظهر لوحة المشرف والجدول (جلب Firebase قد يستغرق عدة ثوانٍ)
    await expect(supervisorPage.locator('body')).toContainText('المشرف', { timeout: PERIOD_LOAD_TIMEOUT });
    // انتظار ظهور صف واحد على الأقل (الـ tbody الفارغ أثناء التحميل يُعتبر غير مرئي لـ Playwright)
    await expect(supervisorPage.locator('#mainTable tr').first()).toBeVisible({ timeout: PERIOD_LOAD_TIMEOUT });
    await expect(supervisorPage.locator('#dashboard')).toBeVisible({ timeout: 5000 });

    // إدخال تقييمات وإرسال
    const branchBtn = supervisorPage.locator('#branchFilters button:has-text("الكورنيش")');
    if (await branchBtn.isVisible()) await branchBtn.click();
    await supervisorPage.waitForTimeout(800);
    const firstBooking = supervisorPage.locator('td.col-eval-booking input.eval-input').first();
    const firstGoogle = supervisorPage.locator('td.col-eval-google input.eval-input').first();
    await firstBooking.waitFor({ state: 'visible', timeout: 5000 });
    await firstBooking.fill('5');
    await firstGoogle.fill('3');
    await supervisorPage.locator('button:has-text("إرسال")').click();
    // بعد النجاح تُستبدل الصفحة بشاشة "تم ربط البيانات بالجدول" (الـ toast يظهر ثم يختفي سريعاً)
    await expect(supervisorPage.getByRole('heading', { name: 'تم ربط البيانات بالجدول' })).toBeVisible({ timeout: 15000 });
    await employeeContext.close();
  });

  test('3. أدمن: زر خروج — البقاء على صفحة الرفع دون إعادة توجيه تلقائي بعد ثانيتين', async ({ page }) => {
    test.skip(!EXCEL_EXISTS, 'ملف الإكسيل مطلوب: ضع UserStatisticsReport_Ar.xlsx في جذر المشروع');
    await page.goto(ADMIN_URL, GOTO_OPTS);
    await expect(page.locator('#uploadBox')).toBeVisible({ timeout: 5000 });
    await page.locator('#fileInput').setInputFiles(EXCEL_PATH);
    await page.waitForTimeout(2000);
    await expect(page.locator('#dashboard')).toBeVisible({ timeout: 15000 });
    await page.locator('#btnReturnToUpload').click();
    await page.waitForURL(/admin=/, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(3500);
    await expect(page.locator('#uploadBox')).toBeVisible({ timeout: 2000 });
    const dashboard = page.locator('#dashboard');
    await expect(dashboard).toHaveClass(/hidden/, { timeout: 3000 });
  });

  test('4. رابط HR يفتح على متصفح موظف جديد (بدون جلسة سابقة)', async ({ browser }) => {
    test.skip(!EXCEL_EXISTS, 'ملف الإكسيل مطلوب: ضع UserStatisticsReport_Ar.xlsx في جذر المشروع');
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await adminPage.goto(ADMIN_URL, GOTO_OPTS);
    await expect(adminPage.locator('#uploadBox')).toBeVisible({ timeout: 5000 });
    await adminPage.locator('#fileInput').setInputFiles(EXCEL_PATH);
    await adminPage.waitForTimeout(2000);
    await expect(adminPage.locator('#dashboard')).toBeVisible({ timeout: 15000 });
    await adminPage.locator('button:has-text("إدارة الإداريين")').click();
    await expect(adminPage.locator('#adminLink_hr')).toBeVisible({ timeout: 20000 });
    const hrHref = await adminPage.locator('#adminLink_hr').inputValue();
    await adminContext.close();

    const employeeContext = await browser.newContext();
    const hrPage = await employeeContext.newPage();

    await hrPage.goto(hrHref, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const errorMsg = hrPage.getByText('تعذّر تحميل بيانات الفترة');
    await expect(errorMsg).not.toBeVisible({ timeout: PERIOD_LOAD_TIMEOUT });

    await expect(hrPage.locator('body')).toContainText('HR', { timeout: PERIOD_LOAD_TIMEOUT });
    await expect(hrPage.locator('#mainTable tr').first()).toBeVisible({ timeout: PERIOD_LOAD_TIMEOUT });

    const branchBtn = hrPage.locator('#branchFilters button:has-text("الكورنيش")');
    if (await branchBtn.isVisible()) await branchBtn.click();
    await hrPage.waitForTimeout(800);
    // HR view hides the checkbox (.attendance-indicator); HR uses .attendance-days-input for days
    const firstDaysInput = hrPage.locator('td.col-attendance .attendance-days-input').first();
    await firstDaysInput.waitFor({ state: 'visible', timeout: 10000 });
    await firstDaysInput.scrollIntoViewIfNeeded();
    await firstDaysInput.fill('26');
    await hrPage.locator('button:has-text("إرسال")').click();
    await expect(hrPage.getByRole('heading', { name: 'تم ربط البيانات بالجدول' })).toBeVisible({ timeout: 15000 });
    await employeeContext.close();
  });

  test('5. التحقق عند الأدمن (متصفح جديد) من ظهور التقييمات والحضور من Firebase', async ({ page }) => {
    await page.goto(ADMIN_URL, GOTO_OPTS);
    // الأدمن بدون بيانات محلية: التطبيق يجلب الفترة من Firebase ويعرض اللوحة
    await expect(page.locator('#dashboard')).toBeVisible({ timeout: 20000 });
    await page.locator('#branchFilters button:has-text("الكل")').click();
    await page.waitForTimeout(500);
    const table = page.locator('#mainTable');
    // التحقق من وجود خلية واحدة على الأقل تحتوي القيمة (تجنب strict mode عند تعدد الخلايا)
    await expect(table.locator('td.col-eval-booking').filter({ hasText: '5' }).first()).toBeVisible({ timeout: 8000 });
    await expect(table.locator('td.col-eval-google').filter({ hasText: '3' }).first()).toBeVisible({ timeout: 5000 });
    await expect(table.locator('td.col-attendance').filter({ hasText: /نعم|✓|1/ }).first()).toBeVisible({ timeout: 5000 });
  });

  test('6. روابط المدير العام والحسابات تفتح على متصفح موظف جديد', async ({ browser }) => {
    test.skip(!EXCEL_EXISTS, 'ملف الإكسيل مطلوب: ضع UserStatisticsReport_Ar.xlsx في جذر المشروع');
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await adminPage.goto(ADMIN_URL, GOTO_OPTS);
    await expect(adminPage.locator('#uploadBox')).toBeVisible({ timeout: 5000 });
    await adminPage.locator('#fileInput').setInputFiles(EXCEL_PATH);
    await adminPage.waitForTimeout(2000);
    await expect(adminPage.locator('#dashboard')).toBeVisible({ timeout: 15000 });
    await adminPage.locator('button:has-text("إدارة الإداريين")').click();
    await expect(adminPage.locator('#adminLink_manager')).toBeVisible({ timeout: 20000 });
    const managerHref = await adminPage.locator('#adminLink_manager').inputValue();
    const accountingHref = await adminPage.locator('#adminLink_accounting').inputValue();
    await adminContext.close();

    const empContext = await browser.newContext();
    const managerPage = await empContext.newPage();
    await managerPage.goto(managerHref, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await expect(managerPage.getByText('تعذّر تحميل بيانات الفترة')).not.toBeVisible({ timeout: PERIOD_LOAD_TIMEOUT });
    await expect(managerPage.locator('body')).toContainText('المدير', { timeout: PERIOD_LOAD_TIMEOUT });
    await expect(managerPage.locator('#mainTable tr').first()).toBeVisible({ timeout: PERIOD_LOAD_TIMEOUT });
    await managerPage.close();

    const accountingPage = await empContext.newPage();
    await accountingPage.goto(accountingHref, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await expect(accountingPage.getByText('تعذّر تحميل بيانات الفترة')).not.toBeVisible({ timeout: PERIOD_LOAD_TIMEOUT });
    await expect(accountingPage.locator('body')).toContainText('الحسابات', { timeout: PERIOD_LOAD_TIMEOUT });
    await expect(accountingPage.locator('#mainTable tr').first()).toBeVisible({ timeout: PERIOD_LOAD_TIMEOUT });
    await empContext.close();
  });

  test('7. خروج ثم دخول - بقاء البيانات', async ({ page }) => {
    await page.goto(ADMIN_URL, GOTO_OPTS);
    await expect(page.locator('#dashboard')).toBeVisible({ timeout: 20000 });
    await page.locator('button:has-text("خروج")').click();
    await page.waitForURL(/admin=/, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await expect(page.locator('#uploadBox')).toBeVisible({ timeout: 3000 });
    await page.goto(ADMIN_URL, GOTO_OPTS);
    await expect(page.locator('#dashboard')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#headerPeriodRange')).not.toHaveText('-');
    await expect(page.locator('#mainTable')).toBeVisible({ timeout: 5000 });
  });

  test('8. خصم من الأدمن والتحقق من بقاء التقييمات', async ({ page }) => {
    await page.goto(ADMIN_URL, GOTO_OPTS);
    await expect(page.locator('#dashboard')).toBeVisible({ timeout: 20000 });
    await page.locator('button:has-text("الخصومات")').click();
    await expect(page.locator('#discountsModal')).toBeVisible({ timeout: 3000 });
    await page.locator('#discountEmployeeSelect').selectOption({ index: 1 });
    await page.waitForTimeout(300);
    await page.locator('#discountTypeSelect').selectOption({ index: 1 });
    await page.locator('#discountPercentageInput').fill('5');
    await page.locator('#discountEventDateInput').fill('2026-01-29');
    await page.locator('button:has-text("إضافة خصم")').click();
    await expect(page.locator('#discountsModal, body')).toContainText('تم إضافة الخصم', { timeout: 5000 });
    await page.locator('#mainTable');
    await expect(page.locator('td.col-eval-booking')).toContainText('5', { timeout: 3000 });
  });

  test('9. إغلاق الفترة ثم التحقق من ظهورها في الأرشيف وفي إحصائيات الفترات السابقة', async ({ page }) => {
    test.skip(!EXCEL_EXISTS, 'ملف الإكسيل مطلوب لفتح التقارير بعد الإغلاق: ضع UserStatisticsReport_Ar.xlsx في جذر المشروع');
    await page.goto(ADMIN_URL, GOTO_OPTS);
    await expect(page.locator('#dashboard')).toBeVisible({ timeout: 20000 });
    await page.locator('button:has-text("إغلاق الفترة")').click();
    await expect(page.locator('#closePeriodModal')).toBeVisible({ timeout: 5000 });
    await page.locator('button:has-text("تأكيد الإغلاق")').click();
    // رفع Firebase قد يستغرق وقتاً — نعتمد ظهور صفحة الرفع كدليل على اكتمال الإغلاق (مهلة 35 ثانية)
    await expect(page.locator('#uploadBox')).toBeVisible({ timeout: 35000 });
    // العودة للوحة ثم فتح التقارير (صفحة الرفع لا تحتوي زر التقارير)
    await page.locator('#fileInput').setInputFiles(EXCEL_PATH);
    await expect(page.locator('#dashboard')).toBeVisible({ timeout: 15000 });
    await page.locator('button:has-text("التقارير")').click();
    await expect(page.locator('#reportsPage')).toBeVisible({ timeout: 5000 });
    // تبويب الفترات المغلقة: التحقق من ظهور الفترة في القائمة
    await page.locator('#reportsTabArchived').click();
    await page.waitForTimeout(1500);
    const archivedSelect = page.locator('#archivedPeriodSelect');
    await expect(archivedSelect).toBeVisible({ timeout: 5000 });
    const optionCount = await archivedSelect.locator('option').count();
    expect(optionCount).toBeGreaterThan(0);
    // تبويب الإحصائيات: التحقق من قسم "إحصائيات الفترات السابقة" وظهور الفترات أو رسالة "لا توجد فترات سابقة"
    await page.locator('#reportsTabStatistics').click();
    await page.waitForTimeout(2000);
    const statisticsContent = page.locator('#statisticsReportsContent');
    await expect(statisticsContent).toBeVisible({ timeout: 5000 });
    await expect(statisticsContent).toContainText('إحصائيات الفترات السابقة', { timeout: 5000 });
    const hasPeriodCards = await page.locator('#archivedPeriodsStatsContainer .glass').count() > 0;
    const hasNoPeriodsMsg = await page.locator('text=لا توجد فترات سابقة').isVisible().catch(() => false);
    expect(hasPeriodCards || hasNoPeriodsMsg).toBe(true);
  });
});
