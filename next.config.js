/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.zeptonow.com',
      },
      {
        protocol: 'https',
        hostname: 'd69ugcdrlg41w.cloudfront.net',
      },
    ],
  },
};

module.exports = nextConfig;
