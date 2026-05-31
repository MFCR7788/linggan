import { createApiResponse } from '@/lib/api-utils';
import { PRESET_CATEGORIES } from '@/lib/preset-keywords';

export const dynamic = 'force-dynamic';

export async function GET() {
  return createApiResponse(PRESET_CATEGORIES);
}
