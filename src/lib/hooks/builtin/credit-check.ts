// 内置 Hook: 点数检查
// 在 LLM 调用前检查点数余额，点数不足时自动注入提示

import type { HookDefinition } from '../types';

export const creditCheckHook: HookDefinition = {
  name: 'credit-check',
  description: '在 LLM 调用前检查点数，余额不足时注入提示',
  events: ['pre_llm_call'],

  handler: async (ctx) => {
    // 点数检查逻辑已在 API 路由中通过 credits.consume 处理
    // 此 hook 作为扩展点预留：可在消息中注入当前点数余额信息
    if (ctx.messages && ctx.custom?.creditsBalance !== undefined) {
      const sysMsg = ctx.messages.find((m) => m.role === 'system');
      if (sysMsg) {
        const balance = ctx.custom.creditsBalance;
        if (typeof sysMsg.content === 'string') {
          sysMsg.content += `\n\n[系统提示] 用户当前灵力余额: ${balance}。请根据余额合理控制内容生成长度。`;
        }
      }
    }
  },
};
