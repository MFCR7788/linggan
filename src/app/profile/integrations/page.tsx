'use client';

import { useRouter } from 'next/navigation';
import { TopNav } from '@/components/TopNav';
import { ProtectedRoute } from '@/components';
import { IntegrationSettings } from '@/components/IntegrationSettings';

function IntegrationsContent() {
  const router = useRouter();
  return (
    <div className="flex flex-col min-h-screen pb-12">
      <TopNav
        title="平台集成"
        showBack
        onBack={() => router.push('/profile/settings')}
      />
      <div className="flex-1 px-4 pt-4">
        <IntegrationSettings />
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <ProtectedRoute>
      <IntegrationsContent />
    </ProtectedRoute>
  );
}
