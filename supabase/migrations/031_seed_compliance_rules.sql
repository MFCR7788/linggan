-- 灵集 V2.0 — C11 合规规则种子数据
-- 存入 knowledge_base，category='compliance'，供 compliance/checker.ts 自动匹配
-- 日期: 2026-06-13

-- 医疗健康：广告法合规
INSERT INTO knowledge_base (title, content, category, tags, source, visibility)
VALUES (
  '医疗健康内容合规',
  '创作医疗健康相关内容时需注意：1. 不得使用"最好""第一""唯一""根治""治愈"等绝对化用语；2. 不得宣传未经批准的医疗效果；3. 保健品不得声称治疗疾病功能；4. 涉及医疗建议需注明"以上内容仅供参考，请遵医嘱"。违反广告法第17条可能面临20-100万元罚款。',
  'compliance',
  ARRAY['医疗', '健康', '药品', '保健品', '医院', '治疗', '高风险'],
  '合规提醒',
  'public'
);

-- 金融理财：投资建议合规
INSERT INTO knowledge_base (title, content, category, tags, source, visibility)
VALUES (
  '金融投资内容合规',
  '创作金融理财相关内容时需注意：1. 不得承诺收益（"稳赚""保本""年化XX%"等表述需谨慎）；2. 投资建议需注明"投资有风险，入市需谨慎"；3. 不得推荐具体股票代码或诱导买卖；4. 涉及基金产品需写明"过往业绩不预示未来表现"。违反《证券法》可能面临行政处罚。',
  'compliance',
  ARRAY['金融', '投资', '理财', '股票', '基金', '收益', '高风险'],
  '合规提醒',
  'public'
);

-- 食品：食品安全宣传
INSERT INTO knowledge_base (title, content, category, tags, source, visibility)
VALUES (
  '食品宣传合规',
  '创作食品相关内容时需注意：1. 普通食品不得声称疾病预防或治疗功能；2. 不得使用"最健康""零负担""纯天然无添加"等未经证实的绝对化表述；3. 进口食品需注明原产地；4. 涉及婴幼儿食品需特别审慎，避免暗示替代母乳。违反《食品安全法》和《广告法》。',
  'compliance',
  ARRAY['食品', '饮食', '健康', '保健', '婴儿', '辅食', '高风险'],
  '合规提醒',
  'public'
);

-- 美妆护肤：化妆品广告
INSERT INTO knowledge_base (title, content, category, tags, source, visibility)
VALUES (
  '化妆品/护肤品内容合规',
  '创作美妆护肤内容时需注意：1. 不得夸大功效（"瞬间美白""7天祛斑""彻底祛痘"）；2. 涉及功效需有检测报告支撑；3. 不得贬低其他品牌进行对比；4. "医美级""药妆"等表述需避免（化妆品与药品须区分）。违反《化妆品监督管理条例》最高可处货值金额30倍罚款。',
  'compliance',
  ARRAY['护肤', '化妆品', '美白', '祛斑', '祛痘', '医美', '高风险'],
  '合规提醒',
  'public'
);

-- 教育培训：广告法
INSERT INTO knowledge_base (title, content, category, tags, source, visibility)
VALUES (
  '教育培训内容合规',
  '创作教育培训相关内容时需注意：1. 不得对升学/考试结果作出明示或暗示的保证性承诺；2. 不得使用"保过""包过""100%通过"等表述；3. K12 学科类培训广告须遵守"双减"政策限制；4. 不得利用学术机构/考试机构名义进行宣传。违反《广告法》第24条。',
  'compliance',
  ARRAY['教育', '培训', '考试', '升学', '保过', 'K12', '高风险'],
  '合规提醒',
  'public'
);
