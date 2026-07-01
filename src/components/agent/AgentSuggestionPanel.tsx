'use client';

// Agent 欢迎面板 — 空状态下的账号类型选择和推荐组合

import { ACCOUNT_TYPE_PRESETS, type RecommendationCombo, type AccountTypePreset } from '@/lib/account-presets';

interface AgentSuggestionPanelProps {
  selectedAccountType: AccountTypePreset | null;
  setSelectedAccountType: (preset: AccountTypePreset | null) => void;
  accountSearch: string;
  setAccountSearch: (search: string) => void;
  onStartCombo: (combo: RecommendationCombo) => void;
}

export function AgentSuggestionPanel({
  selectedAccountType, setSelectedAccountType,
  accountSearch, setAccountSearch,
  onStartCombo,
}: AgentSuggestionPanelProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 text-center pb-8">
      {/* Logo */}
      <img
        src="/brand/logo-mark.png"
        alt="灵集"
        className="w-20 h-20 mb-5 rounded-2xl"
        style={{ filter: 'drop-shadow(0 0 24px rgba(139,92,246,0.5))' }}
      />

      {/* 欢迎语 */}
      <h2 className="text-lg font-semibold text-white mb-2">
        你好！我是灵集AI，你的智能创作助手
      </h2>

      {/* 副标题 */}
      <p className="text-xs text-white mb-4">
        从灵感采集到内容创作，一站式帮你高效产出优质内容
      </p>

      {/* 账号类型选择 / 推荐组合 */}
      <div className="w-full max-w-sm mb-4">
        {!selectedAccountType ? (
          <>
            {/* 搜索 */}
            <div className="relative mb-3">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                placeholder="搜索账号类型..."
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 outline-none focus:border-blue-500/50"
              />
            </div>
            {/* 账号类型网格 */}
            <div className="grid grid-cols-2 gap-2 max-h-[340px] overflow-y-auto pr-0.5">
              {ACCOUNT_TYPE_PRESETS.filter(p =>
                !accountSearch || p.label.includes(accountSearch) || p.desc.includes(accountSearch)
              ).map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setSelectedAccountType(preset)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-blue-500/30 transition-all text-left"
                >
                  <span className="text-2xl">{preset.emoji}</span>
                  <span className="text-sm font-medium text-white">{preset.label}</span>
                  <span className="text-[10px] text-gray-400 leading-tight text-center line-clamp-2">{preset.desc}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* 选中账号类型 + 返回 */}
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => { setSelectedAccountType(null); setAccountSearch(''); }}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 flex-shrink-0"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-2xl">{selectedAccountType.emoji}</span>
              <span className="text-sm font-semibold text-white">{selectedAccountType.label}</span>
              <span className="text-[10px] text-gray-500">{selectedAccountType.audience}</span>
            </div>
            {/* 推荐组合列表 */}
            <div className="space-y-2 max-h-[340px] overflow-y-auto pr-0.5">
              {selectedAccountType.combos.map((combo) => (
                <button
                  key={combo.id}
                  onClick={() => onStartCombo(combo)}
                  className="w-full p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-blue-500/30 transition-all text-left"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-lg">{combo.emoji}</span>
                    <span className="text-sm font-semibold text-white">{combo.title}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mb-2">{combo.desc}</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    {combo.steps.map((step, i) => (
                      <span key={i} className="inline-flex items-center gap-0.5">
                        {i > 0 && <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>}
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/5">
                          {step.label}
                        </span>
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
