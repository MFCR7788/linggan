'use client';
import dynamic from 'next/dynamic';
import { PageLoadingSkeleton } from '@/components/PageLoadingSkeleton';

const PageContent = dynamic(() => import('./page-content'), {
  ssr: false,
  loading: () => <PageLoadingSkeleton title="AI 混剪" />,
});

export default function MashupPage() {
  return <PageContent />;
}
