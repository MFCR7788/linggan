# 灵集 — v0.app UI 设计提示词

> 文档日期：2026-05-20
> 设计工具：v0.dev (Next.js + Tailwind CSS)

---

## 设计规范统一前置

**所有页面共用：**
- 品牌主色：`#7C3AED`（紫色），渐变色 `from-purple-600 to-blue-600`
- 风格：简洁、现代、中文友好、卡片式设计
- 响应式：移动端优先，自适应 PC
- 设计理念：简便、易上手、操作少

---

## 提示词 1：登录/注册页

```
Create a mobile-first login and registration page for "灵集 LingJi", a Chinese creator's AI tool.
Features:
1. Two tabs: "登录" (Login) and "注册" (Register)
2. Login tab:
   - Phone number input (placeholder: "请输入手机号")
   - Get verification code button (countdown 60s)
   - Verification code input
   - Login button (gradient purple to blue)
   - WeChat login button (with WeChat icon)
3. Register tab:
   - Phone number input
   - Verification code input
   - Username input (placeholder: "请设置用户名")
   - Password input (placeholder: "请设置密码")
   - Register button
4. Bottom navigation: "登录即表示您同意用户协议和隐私政策"
Styling:
- Purple (#7C3AED) as primary color
- Clean white background
- Card-based input design
- Mobile optimized (iPhone SE width)
- Gradient button style: "from-purple-600 to-blue-600"
- Language: Simplified Chinese
```

---

## 提示词 2：首页

```
Create the homepage for "灵集 LingJi".
Features:
1. Top header with logo "灵集" on left, notification icon on right
2. Search bar with placeholder "搜索灵感..."
3. Quick actions grid (5 buttons):
   - 文字记录 (pencil icon)
   - 语音记录 (mic icon)
   - 链接解析 (link icon)
   - 上传图片 (image icon)
   - 上传视频 (video icon)
   - Each button has icon + label, card style
4. "最近灵感" section:
   - Section title
   - List of inspiration cards (3 items):
     - Each card shows type icon, title, summary snippet, tags, time
     - Clickable to detail page
5. Bottom navigation bar:
   - 首页 (active)
   - 灵感库
   - AI写作
   - 热点
   - 我的
Styling:
- Purple (#7C3AED) as primary color
- Clean white background
- Card-based design
- Mobile optimized
- Bottom nav with icons
- Language: Simplified Chinese
```

---

## 提示词 3：灵感库列表页

```
Create the inspiration library list page for "灵集 LingJi".
Features:
1. Header with title "灵感库", search, filter icon
2. Filter tabs: "全部", "灵感", "链接", "图片", "视频"
3. Advanced filters (collapsible):
   - Time range dropdown (全部/本周/本月)
   - Tags dropdown
   - Sort dropdown (最新/热度/重要性)
4. List of inspiration cards (grid or list view toggle):
   - Type badge (文字/语音/链接/图片/视频)
   - Thumbnail (for image/video)
   - Title
   - Summary snippet
   - Tags
   - Status badge (待处理/已使用/已归档)
   - Time
5. Floating action button (FAB) in bottom right corner: "+"
6. Bottom navigation bar (same as homepage)
Styling:
- Purple (#7C3AED) as primary color
- Card-based design with subtle shadows
- Clean, easy to browse
- Mobile optimized
- Language: Simplified Chinese
```

---

## 提示词 4：灵感详情页

```
Create the inspiration detail page for "灵集 LingJi".
Features:
1. Header with back arrow, title "灵感详情", share button
2. Content section:
   - Type badge
   - Main title (editable on click)
   - Original content (text, or embed media for image/video/link)
   - AI-generated summary box (with "AI" badge)
   - Key points (bullet list)
   - Tags (clickable, removable, add new tag input)
   - Category
3. Action buttons:
   - "编辑" button
   - "标记已使用" button
   - "生成文案" button (gradient purple to blue)
   - "归档" button
4. Related inspirations section:
   - "相关灵感" title
   - Horizontal scroll list of related cards
5. Bottom bar: "一键生成" button (prominent)
Styling:
- Purple (#7C3AED) as primary color
- Clean, readable layout
- AI summary box with subtle background
- Action buttons in row
- Language: Simplified Chinese
```

---

## 提示词 5：AI 写作助手页

```
Create the AI writing assistant page for "灵集 LingJi".
Features:
1. Header with title "AI 写作助手"
2. Step 1: Select materials
   - Title "选择素材"
   - Toggle: "从灵感库选" / "从热点库选"
   - Grid of selectable cards (with checkbox)
   - Selected counter: "已选 3 个"
3. Step 2: Choose output type
   - Title "选择内容类型"
   - 3 cards: "小红书文案", "短视频脚本", "公众号文章"
4. Step 3: Choose writing style
   - Title "选择文风"
   - 7 options in grid: "真实口语", "小红书博主风", "短视频口播风", "公众号深度风", "朋友圈分享风", "专业但不端着", "犀利观点风"
5. Generation area:
   - "生成" button (large, gradient)
   - "去 AI 味" toggle switch
6. Result area:
   - Loading state (skeleton + spinner)
   - Two tabs: "标准版", "去 AI 味版"
   - Generated content with auto-placed images (placeholders)
   - Copy button
   - Save to inspiration button
Styling:
- Purple (#7C3AED) as primary color
- Step-based wizard layout
- Clear visual hierarchy
- Mobile optimized
- Language: Simplified Chinese
```

---

## 提示词 6：热点监控配置页（第二批）

```
Create the hotspot monitoring configuration page for "灵集 LingJi".
Features:
1. Header with title "热点监控"
2. Add keyword button: "+ 添加监控关键词"
3. List of configured keywords (cards):
   - Keyword name
   - Platforms being monitored (badges: 微信公众号, 小红书, 抖音)
   - Monitoring frequency (e.g., "每6小时")
   - Last checked time
   - Action buttons (edit, pause, delete)
4. "热门关键词推荐" section:
   - Grid of popular keywords with "使用热度" count
   - Click to add
5. Add keyword modal (popup):
   - Input field
   - Platform selection (checkboxes)
   - Frequency dropdown
   - Confirm button
6. Bottom navigation
Styling:
- Purple (#7C3AED) as primary color
- Card-based design
- Clear and easy to configure
- Language: Simplified Chinese
```

---

## 提示词 7：热点库列表页（第二批）

```
Create the hotspot library list page for "灵集 LingJi".
Features:
1. Header with title "热点库", search, filter
2. Filter tabs: "全部", "高可信度", "今日热点", "已转灵感"
3. Hotspot cards list:
   - Credibility score badge (0-100, color coded)
   - Relevance score badge
   - Thumbnail
   - Title
   - Summary
   - Platform badge
   - Time
   - "一键转灵感" button on card
4. Sort and filter options
5. Bottom navigation
Styling:
- Purple (#7C3AED) as primary color
- Credibility score in red/yellow/green
- Card-based design
- Language: Simplified Chinese
```

---

## 提示词 8：个人中心页（第二批）

```
Create the personal center page for "灵集 LingJi".
Features:
1. User profile section:
   - Avatar
   - Username
   - Current plan badge (e.g., "Pro 用户")
2. Usage section:
   - Cards showing monthly usage:
     - AI 总结次数 (progress bar)
     - 视频时长 (progress bar)
     - 存储空间 (progress bar)
3. Menu list:
   - 个人信息
   - 订阅管理
   - 通知设置
   - 帮助中心
   - 关于我们
   - 退出登录
4. "升级到 Creator" banner (if on Free/Pro)
5. Bottom navigation
Styling:
- Purple (#7C3AED) as primary color
- Clean, list-based design
- Progress bars with clear indicators
- Language: Simplified Chinese
```

---

## 提示词 9：订阅页（第二批）

```
Create the subscription plans page for "灵集 LingJi".
Features:
1. Header with title "升级套餐"
2. Plan cards (3 options):
   - Free plan:
     - Price: 免费
     - Features list
     - Current plan badge
   - Pro plan:
     - Price: ¥29.9/月 ¥299/年
     - Features list (highlight key features)
     - "立即订阅" button (gradient)
     - "最受欢迎" ribbon
   - Creator plan:
     - Price: ¥99/月 ¥999/年
     - Features list
     - "立即订阅" button
3. Feature comparison table (collapsible)
4. FAQ section (accordion)
5. Toggle: "月付" / "年付" (with "省 ¥xx" label for annual)
Styling:
- Purple (#7C3AED) as primary color
- Highlight the Pro plan with subtle elevation
- Clear feature comparison
- Language: Simplified Chinese
```
