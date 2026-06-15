'use client';
import dynamic from 'next/dynamic';
import { PageLoadingSkeleton } from '@/components/PageLoadingSkeleton';

const PageContent = dynamic(() => import('./page-content'), {
  ssr: false,
  loading: () => <PageLoadingSkeleton title="标题优化" />,
});

export default function TitleOptimizerPage() {
  return <PageContent />;
}
