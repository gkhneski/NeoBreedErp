/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Ziyaret edilen dinamik sayfalar client router cache'inde 30 sn taze
    // sayilir: menuden geri donusler sunucuya gitmeden aninda acilir.
    // Mutasyonlar revalidatePath ile cache'i zaten dusurur.
    staleTimes: {
      dynamic: 30,
    },
  },
};

export default nextConfig;
