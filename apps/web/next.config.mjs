/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@stalker/shared',
    '@stalker/analytics',
    '@stalker/market-data',
    '@stalker/advisor',
  ],
};

export default nextConfig;
