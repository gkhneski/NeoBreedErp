import { expect, test } from "@playwright/test";

test.describe("oturumsuz erişim", () => {
  test("login sayfası açılır ve form alanları görünür", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("E-posta")).toBeVisible();
    await expect(page.getByLabel("Şifre")).toBeVisible();
    await expect(page.getByRole("button", { name: "Giriş Yap" })).toBeVisible();
  });

  test("oturumsuz /superadmin login'e yönlenir", async ({ page }) => {
    await page.goto("/superadmin");
    await expect(page).toHaveURL(/\/login/);
  });

  test("oturumsuz firma rotası login'e yönlenir", async ({ page }) => {
    await page.goto("/c/00000000-0000-0000-0000-000000000000");
    await expect(page).toHaveURL(/\/login/);
  });

  test("yanlış kimlik bilgisi genel hata döndürür", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-posta").fill("nobody@example.com");
    await page.getByLabel("Şifre").fill("yanlis-sifre-123");
    await page.getByRole("button", { name: "Giriş Yap" }).click();
    await expect(page.getByText("E-posta veya şifre hatalı.")).toBeVisible();
  });
});
