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
const assetHost = cleanAsset || (isProd ? 'https://efficient-integrity-production.up.railway.app' : 'http://127.0.0.1:8000');

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
