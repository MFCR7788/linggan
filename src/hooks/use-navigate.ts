"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { PageKey } from "@/components/BottomNav";
import { PAGE_ROUTES } from "@/lib/style-constants";

export function useNavigate() {
  const router = useRouter();
  return useCallback(
    (page: PageKey, params?: string) => {
      const base = PAGE_ROUTES[page] || "/home";
      router.push(params ? `${base}${params}` : base);
    },
    [router]
  );
}
