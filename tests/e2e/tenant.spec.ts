import { expect, test } from "@playwright/test";

// Gerçek tenant akışı: .env.local'a E2E_EMAIL / E2E_PASSWORD ekleyince çalışır
// (bir test firmasının company_admin kullanıcısı olmalı). Yoksa atlanır.
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe("tenant akışı", () => {
  test.skip(!email || !password, "E2E_EMAIL / E2E_PASSWORD tanımlı değil");

  test("giriş → panel → modüller arası gezinme", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-posta").fill(email!);
    await page.getByLabel("Şifre").fill(password!);
    await page.getByRole("button", { name: "Giriş Yap" }).click();

    await expect(page).toHaveURL(/\/c\//, { timeout: 15_000 });
    await expect(page.getByText("Aktif firma:")).toBeVisible();
    await expect(page.getByText("Toplam Hammadde")).toBeVisible();

    await page.getByRole("button", { name: "Ürün & Stok" }).click();
    await page.getByRole("link", { name: "Hammaddeler" }).click();
    await expect(page).toHaveURL(/\/materials/);

    await page.getByRole("button", { name: "Üretim", exact: true }).click();
    await page.getByRole("link", { name: "Kalite Kontrol" }).click();
    await expect(page).toHaveURL(/\/quality/);
  });

  test("başka firmanın rotası 404 verir (izolasyon)", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-posta").fill(email!);
    await page.getByLabel("Şifre").fill(password!);
    await page.getByRole("button", { name: "Giriş Yap" }).click();
    await expect(page).toHaveURL(/\/c\//, { timeout: 15_000 });

    const response = await page.goto(
      "/c/00000000-0000-0000-0000-000000000001",
    );
    expect(response?.status()).toBe(404);
  });
});
