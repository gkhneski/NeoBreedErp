import { expect, test } from "@playwright/test";

// Sipariş akışı smoke testi: pazaryeri siparişi aç, listede gör, iptal et.
// (Gönderim, serbest lot gerektirir; RPC kuralları DB'de zorlanır.)
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe("siparişler (sevkiyat)", () => {
  test.skip(!email || !password, "E2E_EMAIL / E2E_PASSWORD tanımlı değil");

  test("pazaryeri siparişi aç, iptal et", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-posta").fill(email!);
    await page.getByLabel("Şifre").fill(password!);
    await page.getByRole("button", { name: "Giriş Yap" }).click();
    await expect(page).toHaveURL(/\/c\//, { timeout: 15_000 });

    const companyId = page.url().match(/\/c\/([0-9a-f-]+)/)?.[1];
    const orderNo = `E2E-${Date.now()}`;

    await page.goto(`/c/${companyId}/shipments/new`);
    await page.getByLabel("Kanal *").selectOption("trendyol");
    await page.getByLabel(/Pazaryeri Sipariş No/).fill(orderNo);
    await page.getByLabel("Alıcı Adı").fill("E2E Test Alıcısı");
    await page.getByRole("button", { name: "Siparişi Aç" }).click();

    await expect(page.getByText("Kayıt oluşturuldu.")).toBeVisible();
    await expect(page.getByText(orderNo)).toBeVisible();
    await expect(page.getByText("Trendyol")).toBeVisible();

    await page.getByRole("button", { name: "Siparişi İptal Et" }).click();
    await expect(page).toHaveURL(/\/shipments/);
    await expect(page.getByText("Değişiklikler kaydedildi.")).toBeVisible();
  });
});
