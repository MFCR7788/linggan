'use client';

import dynamic from 'next/dynamic';
import { LoadingSpinner } from '@/components';

const InspirationPageContent = dynamic(() => import('./page-content'), {
  loading: () => <div className="h-screen flex items-center justify-center"><LoadingSpinner text="加载中..." /></div>,
});

export default function InspirationPage() {
  return <InspirationPageContent />;
}
