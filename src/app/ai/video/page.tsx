'use client';
import dynamic from 'next/dynamic';
import { PageLoadingSkeleton } from '@/components/PageLoadingSkeleton';

const PageContent = dynamic(() => import('./page-content'), {
  ssr: false,
  loading: () => <PageLoadingSkeleton title="AI 视频" />,
});

export default function Page() {
  return <PageContent />;
}
