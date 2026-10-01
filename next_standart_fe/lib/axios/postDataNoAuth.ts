/**
 * @copyright (c) 2026 PT Marstech Global (info@marstech.co.id)
 * @project Standard
 * @file page.tsx
 * @description File untuk melakukan post data ke server menggunakan axios
 * 
 * @author Fadil <risqullah.s.fadhilah@gmail.com>
 * @created 2026-07-14
 * 
 * @contributors
 * - Fadil <risqullah.s.fadhilah@gmail.com>
 * 
 * @lastModified Fadil (2026-08-03)
 * @version 1.0.1
 */

import axios from 'axios';
import { logout } from '../tools/serverTools';
import { signOut } from "next-auth/react";

const Axios = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_DIR_PATH_NO_AUTH || '/api/auth/no_auth',
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true,
});


const cleanLocalhostAssets = (val: any): any => {
    if (!val) return val;
    if (typeof val === 'string') {
        if (val.includes('localhost') && (val.includes('/api/assets') || val.includes('/uploads/'))) {
            const match = val.match(/https?:\/\/[^\/]+(\/.*)/);
            if (match && match[1]) return match[1];
        }
        return val;
    }
    if (Array.isArray(val)) {
        return val.map(cleanLocalhostAssets);
    }
    if (typeof val === 'object') {
        const copy: any = {};
        for (const k of Object.keys(val)) {
            copy[k] = cleanLocalhostAssets(val[k]);
        }
        return copy;
    }
    return val;
};

Axios.interceptors.response.use(
    r => {
        if (r && r.data) {
            r.data = cleanLocalhostAssets(r.data);
        }
        return r;
    },
    async (error) => {
        if (error.response?.status === 401) {
            try {
                await signOut({ redirect: false });
            } catch (err) {
                console.error("SignOut error:", err);
            }
            if (typeof window !== "undefined") {
                window.location.href = "/auth/login";
            }
        }
        return Promise.reject(error);
    }
);


async function postDataNoAuth(endpoint: string, data = {}, customHeader = {}) {
    try {
        const header = {
            'X-ENDPOINT': endpoint,
            'X-Custom-Header': JSON.stringify({
                ...customHeader
            }),
        };

        const response = await Axios.post('', data, {
            headers: header,
        });
        return response;
    } catch (error: any) {
        console.log(error)
        if (error?.response?.status == 401) {
            logout(null, true);
        }
        throw error;
    }
}

export default postDataNoAuth;
