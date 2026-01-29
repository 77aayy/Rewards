/**
 * E2E Full Checklist - TEST_CHECKLIST_E2E.md
 * Base URL: https://rewards-63e43.web.app
 * ملف الإكسيل الاختباري: UserStatisticsReport_Ar.xlsx في جذر المشروع
 * Run: npx playwright test e2e-full.spec.js --project=chromium
 */
const path = require('path');
const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.E2E_BASE_URL || 'https://rewards-63e43.web.app';
const ADMIN_URL = `${BASE_URL}/?admin=ayman5255`;
const EXCEL_PATH = path.resolve(__dirname, '..', 'UserStatisticsReport_Ar.xlsx');

test.describe('E2E Full Checklist', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ADMIN_URL, { waitUntil: 'networkidle', timeout: 15000 });
  });

  test('ب. رفع ملف الإكسيل الاختباري', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await expect(page.locator('#uploadBox')).toBeVisible({ timeout: 5000 });
    const fileInput = page.locator('#fileInput');
    await fileInput.setInputFiles(EXCEL_PATH);
    await page.waitForTimeout(2000);
    await expect(page.locator('#dashboard')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#mainTable')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#headerPeriodRange')).not.toHaveText('-');
  });

  test('أ. خروج ثم دخول - لوحة وبيانات تظهر بعد إعادة الدخول', async ({ page }) => {
    await expect(page.locator('#dashboard')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#actionBtns')).toBeVisible();
    await page.locator('button:has-text("خروج")').click();
    await expect(page).toHaveURL(new RegExp('^' + BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/?$'));
    await page.goto(ADMIN_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await expect(page.locator('#dashboard')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#headerPeriodRange')).not.toHaveText('-');
  });

  test('ج. رابط المشرف → اختيار فرع → إدخال تقييمات → إرسال', async ({ page, context }) => {
    await expect(page.locator('#dashboard')).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("إدارة الإداريين")').click();
    await expect(page.locator('#adminManagementModal')).toBeVisible({ timeout: 3000 });
    const supervisorLinkInput = page.locator('#adminLink_supervisor');
    await expect(supervisorLinkInput).toBeVisible({ timeout: 3000 });
    const supervisorHref = await supervisorLinkInput.inputValue();
    expect(supervisorHref).toMatch(/\/supervisor\/[^/]+\/[^/]+/);
    const supervisorPage = await context.newPage();
    await supervisorPage.goto(supervisorHref, { waitUntil: 'networkidle', timeout: 15000 });
    await expect(supervisorPage.locator('body')).toContainText('المشرف', { timeout: 8000 });
    await expect(supervisorPage.locator('#mainTable')).toBeVisible({ timeout: 8000 });
    const branchBtn = supervisorPage.locator('#branchFilters button:has-text("الكورنيش")');
    await branchBtn.click();
    await supervisorPage.waitForTimeout(800);
    const firstBookingInput = supervisorPage.locator('td.col-eval-booking input.eval-input').first();
    const firstGoogleInput = supervisorPage.locator('td.col-eval-google input.eval-input').first();
    await firstBookingInput.fill('5');
    await firstGoogleInput.fill('3');
    await supervisorPage.locator('button:has-text("إرسال")').click();
    await expect(supervisorPage.locator('text=تم الإرسال بنجاح')).toBeVisible({ timeout: 5000 });
    await supervisorPage.close();
  });

  test('د. رابط HR → اختيار فرع → إدخال حضور → إرسال', async ({ page, context }) => {
    await expect(page.locator('#dashboard')).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("إدارة الإداريين")').click();
    await expect(page.locator('#adminManagementModal')).toBeVisible({ timeout: 3000 });
    const hrLinkInput = page.locator('#adminLink_hr');
    await expect(hrLinkInput).toBeVisible({ timeout: 3000 });
    const hrHref = await hrLinkInput.inputValue();
    expect(hrHref).toMatch(/\/hr\/[^/]+\/[^/]+/);
    const hrPage = await context.newPage();
    await hrPage.goto(hrHref, { waitUntil: 'networkidle', timeout: 15000 });
    await expect(hrPage.locator('body')).toContainText('HR', { timeout: 8000 });
    await expect(hrPage.locator('#mainTable')).toBeVisible({ timeout: 8000 });
    const branchBtn = hrPage.locator('#branchFilters button:has-text("الكورنيش")');
    await branchBtn.click();
    await hrPage.waitForTimeout(800);
    const firstToggle = hrPage.locator('td.col-attendance input[type="checkbox"]').first();
    await firstToggle.check();
    await hrPage.locator('button:has-text("إرسال")').click();
    await expect(hrPage.locator('text=تم الإرسال بنجاح')).toBeVisible({ timeout: 5000 });
    await hrPage.close();
  });

  test('هـ. التحقق عند الأدمن من ظهور البيانات', async ({ page, context }) => {
    await expect(page.locator('#dashboard')).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("إدارة الإداريين")').click();
    const supervisorLinkInput = page.locator('#adminLink_supervisor');
    await expect(supervisorLinkInput).toBeVisible({ timeout: 3000 });
    const supervisorHref = await supervisorLinkInput.inputValue();
    const supPage = await context.newPage();
    await supPage.goto(supervisorHref, { waitUntil: 'networkidle', timeout: 15000 });
    await supPage.locator('#branchFilters button:has-text("الكورنيش")').click();
    await supPage.waitForTimeout(500);
    const firstBooking = supPage.locator('td.col-eval-booking input.eval-input').first();
    const firstGoogle = supPage.locator('td.col-eval-google input.eval-input').first();
    await firstBooking.fill('5');
    await firstGoogle.fill('3');
    await supPage.locator('button:has-text("إرسال")').click();
    await expect(supPage.locator('text=تم الإرسال بنجاح')).toBeVisible({ timeout: 5000 });
    await supPage.close();
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('#dashboard')).toBeVisible({ timeout: 10000 });
    await page.locator('#branchFilters button:has-text("الكل")').click();
    await page.waitForTimeout(500);
    const table = page.locator('#mainTable');
    await expect(table.locator('td.col-eval-booking')).toContainText('5', { timeout: 5000 });
    await expect(table.locator('td.col-eval-google')).toContainText('3', { timeout: 5000 });
  });

  test('و. خصم من الأدمن + خروج ثم التحقق من بقاء البيانات', async ({ page }) => {
    await expect(page.locator('#dashboard')).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("الخصومات")').click();
    await expect(page.locator('#discountsModal')).toBeVisible({ timeout: 3000 });
    await page.locator('#discountEmployeeSelect').selectOption({ index: 1 });
    await page.waitForTimeout(300);
    await page.locator('#discountTypeSelect').selectOption({ index: 1 });
    await page.locator('#discountPercentageInput').fill('5');
    await page.locator('#discountEventDateInput').fill('2026-01-29');
    await page.locator('button:has-text("إضافة خصم")').click();
    await expect(page.locator('#discountsModal, body')).toContainText('تم إضافة الخصم', { timeout: 5000 });
    await page.locator('button:has-text("خروج")').click();
    await page.goto(ADMIN_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await expect(page.locator('#dashboard')).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("الخصومات")').click();
    await expect(page.locator('#discountsList')).toContainText('%', { timeout: 3000 });
  });

  test('ز. روابط المدير العام والحسابات - عرض فقط', async ({ page, context }) => {
    await expect(page.locator('#dashboard')).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("إدارة الإداريين")').click();
    const managerLinkInput = page.locator('#adminLink_manager');
    const accountingLinkInput = page.locator('#adminLink_accounting');
    await expect(managerLinkInput).toBeVisible({ timeout: 3000 });
    const managerHref = await managerLinkInput.inputValue();
    const accountingHref = await accountingLinkInput.inputValue();
    const managerPage = await context.newPage();
    await managerPage.goto(managerHref, { waitUntil: 'networkidle', timeout: 15000 });
    await expect(managerPage.locator('body')).toContainText('المدير', { timeout: 8000 });
    await expect(managerPage.locator('button:has-text("إرسال")')).not.toBeVisible();
    await managerPage.close();
    const accountingPage = await context.newPage();
    await accountingPage.goto(accountingHref, { waitUntil: 'networkidle', timeout: 15000 });
    await expect(accountingPage.locator('body')).toContainText('الحسابات', { timeout: 8000 });
    await accountingPage.close();
  });
});
