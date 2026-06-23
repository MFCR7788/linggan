"use client";

import React from "react";

/**
 * 轻量文本格式化组件 — 在显示时将文本转为格式化 JSX
 *
 * 支持：
 * - 空行分段（两个及以上换行 → 段落间距）
 * - **text** → 粗体
 * - - item / • item → 无序列表
 * - 1. item / ① item → 有序列表
 * - ## text / ### text → 标题
 * - > text → 引用块
 *
 * 设计原则：显示时格式化，原始数据保持不变
 */

interface FormattedTextProps {
  text: string;
  /** 文本颜色，默认 #E5E7EB */
  color?: string;
  /** 字体大小，默认 14 */
  fontSize?: number;
  /** 行高，默认 1.7 */
  lineHeight?: number;
  /** 是否显示为紧凑模式（较小间距） */
  compact?: boolean;
}

// ---- 内联标记解析 ----

const BOLD_RE = /\*\*(.+?)\*\*/g;

function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = BOLD_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <strong key={match.index} style={{ color: "#FFFFFF", fontWeight: 700 }}>
        {match[1]}
      </strong>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

// ---- 公共样式 ----

const baseStyles = (
  color: string,
  fontSize: number,
  lineHeight: number
): React.CSSProperties => ({
  color,
  fontSize,
  lineHeight,
  wordBreak: "break-word" as const,
  overflowWrap: "break-word" as const,
});

const headingStyle = (
  color: string,
  fontSize: number,
  level: number
): React.CSSProperties => ({
  color: "#FFFFFF",
  fontSize: level === 1 ? fontSize + 4 : fontSize + 2,
  fontWeight: 700,
  lineHeight: 1.5,
  marginBottom: 4,
  wordBreak: "break-word" as const,
});

const listItemStyle = (
  color: string,
  fontSize: number,
  lineHeight: number
): React.CSSProperties => ({
  ...baseStyles(color, fontSize, lineHeight),
  display: "flex",
  gap: 6,
  marginBottom: 2,
});

const quoteStyle: React.CSSProperties = {
  borderLeft: "3px solid rgba(59,130,246,0.5)",
  paddingLeft: 12,
  color: "#D1D5DB",
  fontStyle: "italic",
  marginBottom: 8,
};

// ---- 主组件 ----

export default function FormattedText({
  text,
  color = "#E5E7EB",
  fontSize = 14,
  lineHeight = 1.7,
  compact = false,
}: FormattedTextProps) {
  if (!text) return null;

  const raw = text.trim();
  if (!raw) return null;

  // 按空行分段
  const paragraphs = raw.split(/\n\s*\n/);

  if (paragraphs.length === 1) {
    // 单段落：检查是否是简单列表
    const lines = raw.split("\n");
    const listResult = tryRenderList(lines, color, fontSize, lineHeight);
    if (listResult) return <div className="selectable">{listResult}</div>;
    return <p className="selectable" style={baseStyles(color, fontSize, lineHeight)}>{parseInline(raw)}</p>;
  }

  return (
    <div className="selectable" style={{ display: "flex", flexDirection: "column", gap: compact ? 4 : 8 }}>
      {paragraphs.map((para, pi) => {
        const lines = para.trim().split("\n");

        // ---- 标题 ----
        const headingMatch = lines[0]?.match(/^(#{1,3})\s+(.+)/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          return (
            <h3 key={pi} style={headingStyle(color, fontSize, level)}>
              {parseInline(headingMatch[2])}
            </h3>
          );
        }

        // ---- 引用 ----
        if (lines.every((l) => l.startsWith(">") || l.trim() === "")) {
          const quoteText = lines
            .map((l) => (l.startsWith("> ") ? l.slice(2) : l.startsWith(">") ? l.slice(1) : l))
            .join("\n")
            .trim();
          return (
            <blockquote key={pi} style={quoteStyle}>
              <p style={baseStyles(color, fontSize, lineHeight)}>{parseInline(quoteText)}</p>
            </blockquote>
          );
        }

        // ---- 列表 ----
        const listResult = tryRenderList(lines, color, fontSize, lineHeight);
        if (listResult) return <div key={pi}>{listResult}</div>;

        // ---- 普通段落 ----
        return (
          <p key={pi} style={baseStyles(color, fontSize, lineHeight)}>
            {parseInline(para.trim())}
          </p>
        );
      })}
    </div>
  );
}

// ---- 列表检测 ----

function tryRenderList(
  lines: string[],
  color: string,
  fontSize: number,
  lineHeight: number
): React.ReactNode | null {
  const cleanLines = lines.filter((l) => l.trim() !== "");

  // 无序列表：- / • / *
  const isUnordered = cleanLines.every((l) => /^[-•*]\s/.test(l.trim()));
  if (isUnordered && cleanLines.length >= 1) {
    return (
      <ul style={{ margin: 0, paddingLeft: 16, listStyle: "none" }}>
        {cleanLines.map((line, i) => {
          const content = line.trim().replace(/^[-•*]\s*/, "");
          return (
            <li key={i} style={listItemStyle(color, fontSize, lineHeight)}>
              <span style={{ color: "rgba(59,130,246,0.7)", flexShrink: 0 }}>•</span>
              <span>{parseInline(content)}</span>
            </li>
          );
        })}
      </ul>
    );
  }

  // 有序列表：1. / ①
  const isOrdered = cleanLines.every((l) => /^\d+[.)、]\s/.test(l.trim()) || /^[①②③④⑤⑥⑦⑧⑨⑩]\s/.test(l.trim()));
  if (isOrdered && cleanLines.length >= 1) {
    return (
      <ol style={{ margin: 0, paddingLeft: 16 }}>
        {cleanLines.map((line, i) => {
          const content = line.trim().replace(/^\d+[.)、]\s*/, "").replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, "");
          return (
            <li key={i} style={{ ...baseStyles(color, fontSize, lineHeight), marginBottom: 2 }}>
              {parseInline(content)}
            </li>
          );
        })}
      </ol>
    );
  }

  return null;
}
