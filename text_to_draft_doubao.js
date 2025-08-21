// A minimal Doubao (Volcengine Ark) chat completion client.
// Per your request, the API key is hardcoded here (not recommended for production).
// You can change the model or endpoint if needed.

const ARK_API_KEY = "77c8bb23-de3e-447a-bd96-f55d384edfbb";
const DOUBAO_MODEL_ID = "doubao-1.5-pro-256k-250115";
const DOUBAO_API_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";

/**
 * Call Doubao with a simple user message. Defaults to "你好".
 * Returns the assistant's message content string.
 *
 * @param {string} messageText
 * @returns {Promise<string>}
 */
async function callDoubao(messageText = "你好") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const res = await fetch(DOUBAO_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ARK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DOUBAO_MODEL_ID,
        max_tokens: 12288,
        messages: [
          // You can add a system message here if you want to steer the behavior
          { role: "user", content: messageText },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Doubao HTTP ${res.status}: ${text}`);
    }

    const data = await res.json();
    // Expected shape (aligned with Ark): { choices: [ { message: { content } } ] }
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Doubao response missing choices[0].message.content");
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Convenience function: specifically call Doubao with "你好".
 */
async function doubaoHello() {
  return callDoubao("");
}

// Instruction text block used for generating podcast scripts
const PODCAST_INSTRUCTION = `请根据上传文档，帮我做一个单人的播客稿，你根据文档内容自己规划一个博客风格。 比如将财经类型的文章，适合轻松明快； 童话故事适合轻柔，让小朋友听起来感兴趣。`;

/**
 * Call Doubao with two content blocks in a single user message:
 *  - Block 1: Instruction text
 *  - Block 2: Document text (placeholder if you don't have it yet)
 *
 * Replace `documentText` later with your actual file content.
 * @param {string} instructionText
 * @param {string} documentText
 * @returns {Promise<string>}
 */
async function callDoubaoWithInstructionAndDoc(
  instructionText = PODCAST_INSTRUCTION,
  documentText = `今天（12 ⽉ 11 ⽇），«中国潮玩第⼀股«泡泡玛特在港股挂牌上市，开盘后迅速拉升到每股 77
港元，较每股 38.5 港元的认购价上涨 100%，公司市值突破 1000 亿港元……
泡泡玛特今年 6 ⽉向港交所递交招股书，其 2017-2019 年复合增速⾼达 1604% 的突破性业绩吸引了众多关注⽬光。作为⼀家年轻⼈创业的潮流杂物渠道商，泡泡玛特究竟因何能够转型为潮玩零售商、IP 品牌运营商，未来指向成为全球领先的潮流⽂化娱乐公司？在潮流、创意、IP 运营能⼒⼀向并不充沛的国内市场，泡泡玛特为何能在很⼤程度上实现“开宗⽴派”和持续引领？
泡泡玛特的崛起是近年来⼀个备受瞩⽬的成⻓案例。⽇前，北京⼤学光华管理学院张⼀弛教授、研究员王⼩⻰撰写的案例《⼝述创业史Ì为何是王宁？为何是泡泡玛特？》正式⼊库。本案例通过⼀⼿访谈，对泡泡玛特创始⼈王宁先⽣历次创业经历进⾏了整理。对其各个创业阶段的决策环境、创业机会进⾏了还原。这便于理解和梳理泡泡玛特 10 年发展道路上所经历的各种可能性。同时本案例对潮玩市场、盲盒消费、⽤⼾受众等⾏业层⾯内容进⾏了简要勾勒，便于读者更加了解泡泡玛特。
以下内容为案例⽂本的摘选。
01
⽿濡⽬染
1987 年⽣于河南新乡的王宁，⽗⺟及亲戚中很少有⼈在体制内⼯作。乘着改⾰开放的春⻛，他们⼤都选择⾃谋出路，做着各式各样的⼩⽣意。在王宁的记忆中，⽗⺟就先后做过⾳像、钟表、渔具等等⽣意，王宁的童年及课余时间也⼤都在⽗⺟的店⾥度过。“每天看着形形⾊⾊的顾客，不知不觉间从⼩就对商业产⽣了兴趣。”王宁表⽰：“每次家族会议或亲朋相聚，⼤家谈论的也都是⽣意，所谓⽿濡⽬染。我从⼩对商业信息⽐较敏感，认为以后⻓⼤了就应该做⽣意、
就应该创业，对批发零售、资⾦往来、⻛险与机会，多⼀份熟悉。也许正是这样的成⻓环境，决定了我会⾛上创业这条路。”
⾼中毕业后的暑假，王宁就迎来了⾃⼰的第⼀次创业。王宁⾃认为⾜球踢得不错，就趁着上⼤学前的假期，在家创办了⼀个⾜球暑期班。虽然没有训练场地、没有教学经验、没有办公室，但这些困难在王宁眼中根本不算什么。他⾃⼰印刷了很多传单，去⼩学⻔⼝派发，很快招到了⼏⼗个学⽣。王宁带着他们去附近的⼴场训练，⼀个⼈⾝兼数职，处理遇到的各种问题。他回忆：“赚的第⼀笔钱虽然不多，但也算是给了⾃⼰⼀个开始，⽽且从⼩喜欢⾜球的我有着⾮常强的好胜⼼，后来也正是这颗好胜⼼慢慢撑起了我的野⼼，让我⽆所畏惧地⾛向远⽅”。
`
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const res = await fetch(DOUBAO_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ARK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DOUBAO_MODEL_ID,
        max_tokens: 12288,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: instructionText },
              { type: "text", text: `【文档开始】\n${documentText}\n【文档结束】` },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Doubao HTTP ${res.status}: ${text}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Doubao response missing choices[0].message.content");
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

/* 
请基于我提供的文件，生成播客脚本。你需要把文本转化为自然的播客表达，具体要求如下：
一、内容处理要求
1. 对原始内容进行深度理解与重构，而非简单朗读或复述。需提炼核心观点、拆解复杂信息，用播客听众易接受的方式重新组织内容。
2. 若内容存在专业术语或复杂概念，需通过角色互动自然解释，如 “这个词听起来有点专业，能不能用通俗的话给我们讲讲？”
3. 适当补充与主题相关的生活化案例、个人经历分享或热门话题关联内容，增强内容的趣味性与共鸣感。
二、语音合成核心要求
1. 角色设定：采用podagent的框架，自动设定 2-3 个适配内容主题的角色（如主持人、嘉宾、分享者等），每个角色需有鲜明且一致的语言风格与性格特征（如主持人亲和活泼、专家嘉宾严谨专业、故事分享者温暖细腻），确保同一角色声线全程一致。
2. 语音自然度控制：
    a. 加入真实对话中的呼吸感（标注 “[呼吸声]”）和自然停顿（短停顿 “[0.5s 停顿]”、长停顿 “[1.2s 停顿]”）
    b. 避免机械连读，在标点符号处体现语调变化（陈述句降调、疑问句升调）
    c. 关键信息处自然加重语气（标注 “[重音]”），如 “这个数据 [重音] 其实颠覆了我们的传统认知”
三、情感与节奏设计
1. 情感映射规则：根据内容情感倾向动态调整语音参数：
• 科普类内容：语速中等（约 180 字 / 分钟），语调平稳略带热情
• 故事类内容：语速随情节变化（铺垫部分稍慢，高潮部分稍快），语调起伏明显
• 观点类内容：核心观点处放缓语速（约 150 字 / 分钟），增强说服力
2. 互动感营造：角色对话间加入自然反应音效，如 “[轻微笑声]”“[赞同的轻哼声]”“[思考的沉吟声]”，模拟真实交流场景，避免单向输出式的生硬表达。
四、音频元素组合规范
1. 背景音乐配置：
• 开篇：[轻快钢琴纯音乐渐入，音量 - 18dB]
• 对话环节：[背景音乐减弱至 - 25dB]
• 重点内容：[背景音乐暂停 / 淡出]
• 转场部分：[音乐短暂上扬后切换风格]
• 结尾：[音乐渐强至 - 18dB 后缓慢淡出]
2. 环境音效添加：根据主题加入场景化音效（如职场话题加入 “[轻微键盘敲击声]”，旅行话题加入 “[远处海浪声]”），音量控制在 - 30dB 以下不干扰语音
五、内容呈现要求
1. 将原始文本转化为自然口语表达，删除书面化词汇，增加对话化衔接（如 “你知道吗？”“说到这我想起”“其实更重要的是”）
2. 长段落自动拆分为由不同角色承接的对话片段，避免单一角色长时间独白（最长连续表达不超过 30 秒）
3. 专业内容需通过角色互动自然解释，如 “简单说就是……”“打个比方的话……”，确保听众理解无障碍
*/

module.exports = {
  callDoubao,
  doubaoHello,
  callDoubaoWithInstructionAndDoc
};