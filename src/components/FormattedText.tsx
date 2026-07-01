"use client";

import React from "react";

/**
 * 豆包风格聊天内容格式化组件
 *
 * 支持：
 * - # 一级标题 / ## 二级标题 / ### 三级标题
 * - **text** → 粗体
 * - `text` → 行内代码
 * - - item / • item → 无序列表
 * - 1. item → 有序列表
 * - > text → 引用块
 * - --- → 分割线
 * - 空行 → 段落间距
 * - ``` code ``` → 代码块
 */

interface FormattedTextProps {
  text: string;
  color?: string;
  fontSize?: number;
  lineHeight?: number;
  compact?: boolean;
}

// ---- 内联元素解析 ----

const BOLD_RE = /\*\*(.+?)\*\*/g;
const CODE_RE = /`([^`]+)`/g;

interface InlineToken {
  type: 'text' | 'bold' | 'code';
  content: string;
}

function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const boldMatch = BOLD_RE.exec(remaining);
    const codeMatch = CODE_RE.exec(remaining);

    BOLD_RE.lastIndex = 0;
    CODE_RE.lastIndex = 0;

    const boldIdx = boldMatch?.index ?? -1;
    const codeIdx = codeMatch?.index ?? -1;

    if ((boldIdx === -1 && codeIdx === -1) || (boldIdx === -1 && codeIdx > -1 && codeIdx > 0) || (codeIdx === -1 && boldIdx > -1 && boldIdx > 0) || (boldIdx > -1 && codeIdx > -1 && Math.min(boldIdx, codeIdx) > 0)) {
      let nextIdx = remaining.length;
      if (boldIdx > -1 && boldIdx < nextIdx) nextIdx = boldIdx;
      if (codeIdx > -1 && codeIdx < nextIdx) nextIdx = codeIdx;
      if (nextIdx === -1 || nextIdx > remaining.length) nextIdx = remaining.length;

      if (nextIdx > 0) {
        tokens.push({ type: 'text', content: remaining.substring(0, nextIdx) });
        remaining = remaining.substring(nextIdx);
      }
      continue;
    }

    if (boldIdx === 0) {
      tokens.push({ type: 'bold', content: boldMatch![1] });
      remaining = remaining.substring(boldMatch![0].length);
    } else if (codeIdx === 0) {
      tokens.push({ type: 'code', content: codeMatch![1] });
      remaining = remaining.substring(codeMatch![0].length);
    } else if (boldIdx >= 0 || codeIdx >= 0) {
      const next = Math.min(
        boldIdx >= 0 ? boldIdx : Infinity,
        codeIdx >= 0 ? codeIdx : Infinity
      );
      if (next > 0) {
        tokens.push({ type: 'text', content: remaining.substring(0, next) });
      }
      remaining = remaining.substring(next);
    } else {
      tokens.push({ type: 'text', content: remaining });
      break;
    }
  }

  return tokens;
}

function renderInline(tokens: InlineToken[], baseColor: string, baseFontSize: number): React.ReactNode {
  return tokens.map((token, i) => {
    switch (token.type) {
      case 'bold':
        return (
          <strong key={i} style={{ color: "#FFFFFF", fontWeight: 600 }}>
            {token.content}
          </strong>
        );
      case 'code':
        return (
          <code key={i} style={{
            fontFamily: '"SF Mono", "Fira Code", Menlo, Monaco, monospace',
            fontSize: Math.round(baseFontSize * 0.88),
            padding: '1px 6px',
            borderRadius: 4,
            background: 'rgba(255,255,255,0.08)',
            color: '#FCA5A5',
          }}>
            {token.content}
          </code>
        );
      default:
        return <React.Fragment key={i}>{token.content}</React.Fragment>;
    }
  });
}

// ---- 公共样式 ----

const baseStyle = (color: string, fontSize: number, lh: number): React.CSSProperties => ({
  color,
  fontSize,
  lineHeight: lh,
  wordBreak: "break-word" as const,
  overflowWrap: "break-word" as const,
});

const headingStyles: Record<number, React.CSSProperties> = {
  1: { color: "#FFFFFF", fontSize: 20, fontWeight: 700, lineHeight: 1.4, margin: "16px 0 8px" },
  2: { color: "#FFFFFF", fontSize: 17, fontWeight: 700, lineHeight: 1.4, margin: "14px 0 6px" },
  3: { color: "#FFFFFF", fontSize: 15, fontWeight: 600, lineHeight: 1.5, margin: "12px 0 4px" },
};

const hrStyle: React.CSSProperties = {
  border: "none",
  borderTop: "1px solid rgba(255,255,255,0.1)",
  margin: "12px 0",
};

const codeBlockStyle: React.CSSProperties = {
  margin: "8px 0",
  padding: 12,
  borderRadius: 8,
  background: "rgba(0,0,0,0.3)",
  border: "1px solid rgba(255,255,255,0.08)",
  overflowX: "auto" as const,
  fontFamily: '"SF Mono", "Fira Code", Menlo, Monaco, monospace',
  fontSize: 13,
  lineHeight: 1.6,
  color: "#E5E7EB",
  whiteSpace: "pre-wrap" as const,
};

const quoteStyle: React.CSSProperties = {
  borderLeft: "3px solid rgba(59,130,246,0.5)",
  padding: "6px 0 6px 14px",
  margin: "12px 0",
  color: "#D1D5DB",
  lineHeight: 1.7,
};

// ---- 主组件 ----

export default function FormattedText({
  text,
  color = "#E5E7EB",
  fontSize = 15,
  lineHeight = 1.75,
  compact = false,
}: FormattedTextProps) {
  if (!text) return null;

  const raw = text.trim();
  if (!raw) return null;

  // 处理代码块 ```...```
  const codeBlockParts = raw.split(/```(\w*)\n?/);
  if (codeBlockParts.length > 1) {
    const elements: React.ReactNode[] = [];
    let i = 0;
    while (i < codeBlockParts.length) {
      if (i + 2 < codeBlockParts.length) {
        // 代码块之前的文本
        if (codeBlockParts[i].trim()) {
          elements.push(
            <FormattedText key={`pre-${i}`} text={codeBlockParts[i]} color={color} fontSize={fontSize} lineHeight={lineHeight} compact={compact} />
          );
        }
        // 代码块内容
        const codeContent = codeBlockParts[i + 2];
        if (codeContent.trim()) {
          elements.push(
            <pre key={`code-${i}`} style={codeBlockStyle}>
              <code>{codeContent}</code>
            </pre>
          );
        }
        i += 3;
      } else {
        if (codeBlockParts[i].trim()) {
          elements.push(
            <FormattedText key={`rest-${i}`} text={codeBlockParts[i]} color={color} fontSize={fontSize} lineHeight={lineHeight} compact={compact} />
          );
        }
        i++;
      }
    }
    return <div className="selectable chat-content">{elements}</div>;
  }

  // 按空行分段
  const paragraphs = raw.split(/\n\s*\n/);

  if (paragraphs.length === 1) {
    const lines = raw.split("\n");
    const block = renderBlock(lines, color, fontSize, lineHeight);
    if (block) return <div className="selectable chat-content">{block}</div>;
    return (
      <p className="selectable chat-content" style={baseStyle(color, fontSize, lineHeight)}>
        {renderInline(tokenizeInline(raw), color, fontSize)}
      </p>
    );
  }

  const gap = compact ? 8 : 14;

  return (
    <div className="selectable chat-content" style={{ display: "flex", flexDirection: "column", gap }}>
      {paragraphs.map((para, pi) => {
        const lines = para.trim().split("\n");

        // 代码块
        if (lines[0]?.startsWith("```")) {
          const codeLines = lines.slice(1, lines[lines.length - 1] === "```" ? lines.length - 1 : lines.length);
          return (
            <pre key={pi} style={codeBlockStyle}>
              <code>{codeLines.join("\n")}</code>
            </pre>
          );
        }

        // 分割线: ---
        if (lines.length === 1 && /^-{3,}$/.test(lines[0].trim())) {
          return <hr key={pi} style={hrStyle} />;
        }

        // 标题
        const headingMatch = lines[0]?.match(/^(#{1,3})\s+(.+)/);
        if (headingMatch && lines.length === 1) {
          const level = headingMatch[1].length;
          const Tag = `h${level}` as keyof JSX.IntrinsicElements;
          return React.createElement(
            Tag,
            { key: pi, style: headingStyles[level] },
            renderInline(tokenizeInline(headingMatch[2]), color, fontSize),
          );
        }

        // 引用
        if (lines.every((l) => l.startsWith(">") || l.trim() === "")) {
          const quoteText = lines
            .map((l) => (l.startsWith("> ") ? l.slice(2) : l.startsWith(">") ? l.slice(1) : l))
            .join("\n")
            .trim();
          return (
            <blockquote key={pi} style={quoteStyle}>
              {renderInline(tokenizeInline(quoteText), "#D1D5DB", fontSize)}
            </blockquote>
          );
        }

        // 列表
        const listResult = renderList(lines, color, fontSize, lineHeight);
        if (listResult) return <div key={pi}>{listResult}</div>;

        // 普通段落
        return (
          <p key={pi} style={baseStyle(color, fontSize, lineHeight)}>
            {renderInline(tokenizeInline(para.trim()), color, fontSize)}
          </p>
        );
      })}
    </div>
  );
}

// ---- 段落级渲染 ----

function renderBlock(
  lines: string[],
  color: string,
  fontSize: number,
  lineHeight: number
): React.ReactNode | null {
  const cleanLines = lines.filter((l) => l.trim() !== "");

  // 标题
  if (cleanLines.length === 1) {
    const headingMatch = cleanLines[0].match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      return React.createElement(
        `h${level}` as keyof JSX.IntrinsicElements,
        { style: headingStyles[level] },
        renderInline(tokenizeInline(headingMatch[2]), color, fontSize),
      );
    }
  }

  // 分割线
  if (cleanLines.length === 1 && /^-{3,}$/.test(cleanLines[0].trim())) {
    return <hr style={hrStyle} />;
  }

  // 引用
  if (cleanLines.every((l) => l.startsWith(">"))) {
    const quoteText = cleanLines
      .map((l) => (l.startsWith("> ") ? l.slice(2) : l.startsWith(">") ? l.slice(1) : l))
      .join("\n")
      .trim();
    return (
      <blockquote style={quoteStyle}>
        {renderInline(tokenizeInline(quoteText), "#D1D5DB", fontSize)}
      </blockquote>
    );
  }

  // 列表
  const listResult = renderList(cleanLines, color, fontSize, lineHeight);
  if (listResult) return listResult;

  return null;
}

function renderList(
  lines: string[],
  color: string,
  fontSize: number,
  lineHeight: number
): React.ReactNode | null {
  const cleanLines = lines.filter((l) => l.trim() !== "");
  if (cleanLines.length === 0) return null;

  // 无序列表
  const isUnordered = cleanLines.every((l) => /^[-•*]\s/.test(l.trim()));
  if (isUnordered) {
    return (
      <ul style={{ margin: "8px 0 12px", paddingLeft: 22 }}>
        {cleanLines.map((line, i) => {
          const content = line.trim().replace(/^[-•*]\s*/, "");
          return (
            <li key={i} style={{ ...baseStyle(color, fontSize, lineHeight), marginBottom: 6, display: "list-item", lineHeight: 1.7 }}>
              {renderInline(tokenizeInline(content), color, fontSize)}
            </li>
          );
        })}
      </ul>
    );
  }

  // 有序列表
  const isOrdered = cleanLines.every((l) => /^\d+[.)、]\s/.test(l.trim()));
  if (isOrdered) {
    return (
      <ol style={{ margin: "8px 0 12px", paddingLeft: 22 }}>
        {cleanLines.map((line, i) => {
          const content = line.trim().replace(/^\d+[.)、]\s*/, "");
          return (
            <li key={i} style={{ ...baseStyle(color, fontSize, lineHeight), marginBottom: 6, lineHeight: 1.7 }}>
              {renderInline(tokenizeInline(content), color, fontSize)}
            </li>
          );
        })}
      </ol>
    );
  }

  return null;
}
