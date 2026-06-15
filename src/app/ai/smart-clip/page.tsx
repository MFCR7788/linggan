'use client';
import dynamic from 'next/dynamic';
import { PageLoadingSkeleton } from '@/components/PageLoadingSkeleton';

const PageContent = dynamic(() => import('./page-content'), {
  ssr: false,
  loading: () => <PageLoadingSkeleton title="智能编辑" />,
});

export default function SmartClipPage() {
  return <PageContent />;
}
