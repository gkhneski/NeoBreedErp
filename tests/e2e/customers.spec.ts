import { expect, test } from "@playwright/test";

// Müşteri CRUD smoke testi. E2E_EMAIL / E2E_PASSWORD ister (tenant.spec ile aynı).
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe("müşteriler (fason)", () => {
  test.skip(!email || !password, "E2E_EMAIL / E2E_PASSWORD tanımlı değil");

  test("müşteri oluştur, listede gör, sil", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-posta").fill(email!);
    await page.getByLabel("Şifre").fill(password!);
    await page.getByRole("button", { name: "Giriş Yap" }).click();
    await expect(page).toHaveURL(/\/c\//, { timeout: 15_000 });

    const name = `E2E Fason Müşterisi ${Date.now()}`;

    await page.getByRole("button", { name: "Tedarik & Müşteriler" }).click();
    await page.getByRole("link", { name: "Müşteriler" }).click();
    await expect(page).toHaveURL(/\/customers/);

    await page.getByRole("link", { name: "Yeni Müşteri" }).click();
    await page.getByLabel("Ad *").fill(name);
    await page.getByRole("button", { name: "Kaydet" }).click();

    await expect(page.getByText("Kayıt oluşturuldu.")).toBeVisible();
    const row = page.getByRole("row", { name: new RegExp(name) });
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "Sil" }).click();
    await expect(page.getByText("Kayıt silindi.")).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(name) })).toHaveCount(0);
  });
});
