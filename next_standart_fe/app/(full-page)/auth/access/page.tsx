/* eslint-disable @next/next/no-img-element */
'use client';
import { useRouter } from 'next/navigation';
import React from 'react';
import { Button } from 'primereact/button';

const AccessDeniedPage = () => {
    const router = useRouter();

    return (
        <div className="surface-ground flex align-items-center justify-content-center min-h-screen min-w-screen overflow-hidden">
            <div className="flex flex-column align-items-center justify-content-center">
                <div
                    style={{
                        borderRadius: '32px',
                        padding: '0.3rem',
                        background: 'linear-gradient(180deg, rgba(239, 68, 68, 0.2) 10%, rgba(239, 68, 68, 0) 30%)'
                    }}
                >
                    <div className="w-full surface-card py-6 px-5 sm:px-8 flex flex-column align-items-center border-round-2xl shadow-3" style={{ maxWidth: '480px' }}>
                        <div className="flex justify-content-center align-items-center bg-red-500 border-circle mb-3" style={{ height: '4rem', width: '4rem' }}>
                            <i className="pi pi-fw pi-lock text-3xl text-white"></i>
                        </div>
                        <h1 className="text-900 font-bold text-3xl mb-2 text-center">Akses Ditolak</h1>
                        <div className="text-600 mb-5 text-center text-sm">Anda tidak memiliki izin untuk mengakses halaman ini atau sesi Anda perlu diperbarui.</div>
                        <Button
                            icon="pi pi-arrow-left"
                            label="Kembali ke Dashboard Utama"
                            className="p-button-success font-semibold px-4 py-2"
                            onClick={() => { window.location.href = '/dashboard'; }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AccessDeniedPage;
