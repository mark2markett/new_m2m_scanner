/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow the jose & bcryptjs packages in Edge runtime used by middleware
  experimental: {
    serverComponentsExternalPackages: ['bcryptjs'],
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
