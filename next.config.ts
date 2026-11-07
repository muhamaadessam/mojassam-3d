import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // The account page became the account menu; old links land on the order history.
  async redirects() {
    return [{ source: '/account', destination: '/orders', permanent: true }];
  },
};

export default nextConfig;
