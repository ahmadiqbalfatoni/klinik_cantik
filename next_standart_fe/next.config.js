const isProd = process.env.NODE_ENV === 'production';
const candidates = [
    process.env.PUBLIC_ASSET_ORG,
    process.env.NEXT_PUBLIC_API_URL,
    process.env.API_URL,
];

let rawAsset = '';
for (const cand of candidates) {
    if (!cand || cand.includes('<') || cand.includes('>')) continue;
    if (isProd && (cand.includes('localhost') || cand.includes('127.0.0.1'))) {
        continue;
    }
    rawAsset = cand;
    break;
}

const cleanAsset = rawAsset ? rawAsset.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '') : '';
let assetHost = cleanAsset || (isProd ? 'https://efficient-integrity-production-7aa7.up.railway.app' : 'http://127.0.0.1:8000');

// Pastikan selalu memiliki prefix protokol http:// atau https://
if (!assetHost.startsWith('http://') && !assetHost.startsWith('https://')) {
    assetHost = (isProd ? 'https://' : 'http://') + assetHost;
}

// Auto-koreksi jika domain Railway tertulis tanpa suffix -7aa7
if (assetHost.includes('efficient-integrity-production.up.railway.app') && !assetHost.includes('-7aa7')) {
    assetHost = assetHost.replace('efficient-integrity-production.up.railway.app', 'efficient-integrity-production-7aa7.up.railway.app');
}

/** @type {import('next').NextConfig} */
const nextConfig = {
    eslint: {
        ignoreDuringBuilds: true,
    },
    async rewrites() {
        return [
            {
                source: '/api/assets/:path*',
                destination: `${assetHost}/:path*`,
            },
            {
                source: '/uploads/:path*',
                destination: `${assetHost}/uploads/:path*`,
            },
        ];
    }
}

module.exports = nextConfig
