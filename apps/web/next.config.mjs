/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@stalker/shared',
    '@stalker/analytics',
    '@stalker/market-data',
    '@stalker/advisor',
  ],
  webpack: (config) => {
    // Resolve .js imports to .ts source files for workspace packages
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
