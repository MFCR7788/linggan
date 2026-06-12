const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ["fibzvsstxxkdcflvtdzu.supabase.co"],
  },
  experimental: {
    instrumentationHook: true,
    serverActions: {
      bodySizeLimit: '30mb',
    },
    serverComponentsExternalPackages: ['pdf-parse', 'better-sqlite3'],
  },
};

export default nextConfig;
