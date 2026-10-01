/**
 * @file apiConfig.ts
 * @description Helper terpusat untuk URL API backend dengan fallback cerdas untuk deployment Railway
 */

export const getBackendApiUrl = (): string => {
    const isProd = process.env.NODE_ENV === 'production';
    const candidates = [
        process.env.NEXT_PUBLIC_API_URL,
        process.env.API_URL,
        process.env.NEXT_PUBLIC_URL_API,
        process.env.NEXT_PUBLIC_API_BASE_URL,
    ];

    let url = '';
    for (const cand of candidates) {
        if (!cand || cand.includes('<') || cand.includes('>')) continue;
        if (isProd && (cand.includes('localhost') || cand.includes('127.0.0.1'))) {
            continue;
        }
        url = cand;
        break;
    }

    // Jika kosong atau masih berupa placeholder bawaan template
    if (!url) {
        if (isProd) {
            return 'https://efficient-integrity-production-7aa7.up.railway.app/api/v1';
        }
        return 'http://localhost:8000/api/v1';
    }

    // Auto-koreksi jika domain Railway tertulis tanpa suffix -7aa7
    if (url.includes('efficient-integrity-production.up.railway.app') && !url.includes('-7aa7')) {
        url = url.replace('efficient-integrity-production.up.railway.app', 'efficient-integrity-production-7aa7.up.railway.app');
    }

    // Pastikan selalu memiliki prefix protokol http:// atau https://
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = (isProd ? 'https://' : 'http://') + url;
    }

    url = url.endsWith('/') ? url.slice(0, -1) : url;

    if (!url.endsWith('/api/v1')) {
        url = `${url}/api/v1`;
    }

    return url;
};
