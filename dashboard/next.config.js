/** @type {import('next').NextConfig} */
const nextConfig = {
  // Skip prerender errors for dynamic pages
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
};

module.exports = nextConfig;
