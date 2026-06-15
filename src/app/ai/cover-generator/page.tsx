'use client';
import dynamic from 'next/dynamic';
import { PageLoadingSkeleton } from '@/components/PageLoadingSkeleton';

const PageContent = dynamic(() => import('./page-content'), {
  ssr: false,
  loading: () => <PageLoadingSkeleton title="封面生成" />,
});

export default function CoverGeneratorPage() {
  return <PageContent />;
}
