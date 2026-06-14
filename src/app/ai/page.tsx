"use client";

import { redirect } from "next/navigation";

// V3.0: AI 创作中心已合并到 Agent 统一入口
// 此页面重定向到 /agent，内部子路由 (/ai/copywriting 等) 保留作为深度链接

export default function Page() {
  redirect('/agent');
}
