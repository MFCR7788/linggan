"use client";

import { useMemo } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export function useSupabase() {
  return useMemo(() => {
    try {
      return createClientComponentClient();
    } catch (e) {
      console.warn("Supabase client initialization failed", e);
      return null;
    }
  }, []);
}
