'use client';

// ParamCard — 结构化参数选择卡片
// 解析 <param_card> JSON schema，渲染原生表单控件（下拉/滑块/开关/文本）
// 与 ChoiceCards 并存，提供更丰富的参数交互

import { useState, useEffect, useCallback } from 'react';
import type { ParamCardSchema, ParamField } from '@/lib/agent/param-parser';

export type { ParamCardSchema, ParamField, SelectOption } from '@/lib/agent/param-parser';

interface ParamCardProps {
  schema: ParamCardSchema;
  onChange: (values: Record<string, unknown>) => void;
}

export function ParamCard({ schema, onChange }: ParamCardProps) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const field of schema.fields) {
      if (field.default !== undefined) {
        init[field.name] = field.default;
      } else if (field.type === 'toggle') {
        init[field.name] = false;
      } else if (field.type === 'slider') {
        init[field.name] = field.min ?? 0;
      } else if (field.type === 'select' && field.options?.length) {
        init[field.name] = field.options[0].value;
      } else {
        init[field.name] = '';
      }
    }
    return init;
  });

  const update = useCallback(
    (name: string, value: unknown) => {
      setValues((prev) => {
        const next = { ...prev, [name]: value };
        onChange(next);
        return next;
      });
    },
    [onChange]
  );

  return (
    <div
      className="rounded-2xl p-4 space-y-4"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      {/* 标题 */}
      <div>
        <h3 className="text-sm font-semibold text-white/90">{schema.title}</h3>
        {schema.description && (
          <p className="text-xs text-white/40 mt-0.5">{schema.description}</p>
        )}
      </div>

      {/* 字段 */}
      {schema.fields.map((field) => (
        <ParamFieldRow key={field.name} field={field} value={values[field.name]} onChange={update} />
      ))}
    </div>
  );
}

// ─── 单字段渲染 ────────────────────────────────────────────

interface FieldRowProps {
  field: ParamField;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
}

function ParamFieldRow({ field, value, onChange }: FieldRowProps) {
  switch (field.type) {
    case 'select':
      return <SelectField field={field} value={value as string} onChange={onChange} />;
    case 'slider':
      return <SliderField field={field} value={value as number} onChange={onChange} />;
    case 'toggle':
      return <ToggleField field={field} value={value as boolean} onChange={onChange} />;
    case 'text':
      return <TextField field={field} value={value as string} onChange={onChange} />;
    default:
      return null;
  }
}

// ─── 下拉/按钮组 ───────────────────────────────────────────

function SelectField({
  field,
  value,
  onChange,
}: {
  field: ParamField;
  value: string;
  onChange: (name: string, value: unknown) => void;
}) {
  const options = field.options || [];

  return (
    <div>
      <label className="text-xs text-white/50 mb-1.5 block">
        {field.label}
        {field.required ? <span className="text-red-400 ml-0.5">*</span> : null}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isSelected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(field.name, opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-[0.97] ${
                isSelected
                  ? 'bg-blue-500/30 border border-blue-400/50 text-blue-200'
                  : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/8'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── 滑块 ──────────────────────────────────────────────────

function SliderField({
  field,
  value,
  onChange,
}: {
  field: ParamField;
  value: number;
  onChange: (name: string, value: unknown) => void;
}) {
  const min = field.min ?? 0;
  const max = field.max ?? 100;
  const step = field.step ?? 1;
  const displayValue = value ?? field.default ?? min;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs text-white/50">
          {field.label}
          {field.required ? <span className="text-red-400 ml-0.5">*</span> : null}
        </label>
        <span className="text-xs font-mono text-blue-300">
          {displayValue}
          {field.unit || ''}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={displayValue}
        onChange={(e) => onChange(field.name, Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, #3B82F6 ${((displayValue - min) / (max - min)) * 100}%, rgba(255,255,255,0.1) ${((displayValue - min) / (max - min)) * 100}%)`,
          accentColor: '#3B82F6',
        }}
      />
      <div className="flex justify-between mt-0.5">
        <span className="text-[10px] text-white/25">
          {min}
          {field.unit || ''}
        </span>
        <span className="text-[10px] text-white/25">
          {max}
          {field.unit || ''}
        </span>
      </div>
    </div>
  );
}

// ─── 开关 ──────────────────────────────────────────────────

function ToggleField({
  field,
  value,
  onChange,
}: {
  field: ParamField;
  value: boolean;
  onChange: (name: string, value: unknown) => void;
}) {
  const isOn = value ?? field.default ?? false;

  return (
    <div className="flex items-center justify-between">
      <label className="text-xs text-white/50">
        {field.label}
        {field.required ? <span className="text-red-400 ml-0.5">*</span> : null}
      </label>
      <button
        type="button"
        role="switch"
        aria-checked={isOn}
        onClick={() => onChange(field.name, !isOn)}
        className={`relative w-10 h-5 rounded-full transition-colors ${
          isOn ? 'bg-blue-500' : 'bg-white/15'
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            isOn ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

// ─── 文本输入 ──────────────────────────────────────────────

function TextField({
  field,
  value,
  onChange,
}: {
  field: ParamField;
  value: string;
  onChange: (name: string, value: unknown) => void;
}) {
  return (
    <div>
      <label className="text-xs text-white/50 mb-1.5 block">
        {field.label}
        {field.required ? <span className="text-red-400 ml-0.5">*</span> : null}
      </label>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(field.name, e.target.value)}
        placeholder={field.placeholder}
        maxLength={field.maxLength}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-blue-500/50 transition-colors"
      />
    </div>
  );
}
