---
title: 当我给博客装上AI智能客服
description: AI 智能时代快速崛起 为了将AI赋能各行业，我学习并且实现了将AI客服搬入我的博客，虽然我的博客主要是记录技术以及学习资料。但是任何一门技术只要能从点出发那就能扩大成面，在我的博客上能达到预期效果，那么就能解决行业问题比如电商类网站的AI咨询回复客服、各大服务业的门户网站如果有很多潜客咨询无法自助回复一般性问题就可能导致客户流失等等。
date: 2026-09-01
updated: 2026-10-03
tags:
  - n8n
  - nuxtjs
  - vue
kicker: AI智能客服
cover: /uploads/1790942853815.png
featured: true
draft: false
serif: true
author: L
---

这篇文章主要记录 n8n 搭建智能客服 嵌入一般性门户网站、电商门户网站、博客等实现AI智能客服 7*24小时 不间断自动回复客户 咨询 产品等相关情况，减少潜客流失，减轻运营成本。
n8n 智能客服的核心架构可以概括为“前端嵌入 + 后端工作流 + RAG 知识库 + 记忆与升级机制”。下面这份文档从博客场景出发，同时兼顾电商门户和其他网站的嵌入需求。

**核心优势对比**：

| 维度 | SaaS 客服工具 | n8n 自建方案 |
| --- | --- | --- |
| 费用 | 每月 $49-$500+ | 仅 API 调用费（约 $10/月, 用国内deepseek等模型的话更省） |
| 数据归属 | 第三方服务器 | 完全自控 |
| 定制能力 | 受限于产品功能 | 无限扩展 |
| 知识来源 | 手动录入 FAQ | 自动同步网站内容 |
| 嵌入方式 | 平台专属组件 | 通用 HTML/JS |

n8n 官方提供了完整的**网站内容 RAG 聊天机器人模板**，能够自动抓取网站内容、建立向量索引，并通过 Chat Agent 回答访客问题

##  整体架构：智能客服的三大组件

一个完整的 n8n 智能客服系统由三个部分组成：

**① 知识 ingestion 工作流（离线/定时运行）**

负责将网站内容转化为 AI 可检索的向量知识库。流程包括：抓取网站页面 → 提取正文 → 分块 → 生成 Embedding → 存入向量数据库

**② 对话处理工作流（实时运行）**

当用户发送消息时，Chat Trigger 接收请求 → AI Agent 检索向量数据库 → 结合对话记忆生成回答 → 返回给前端

**③ 前端聊天界面（嵌入网站）**

通过 n8n 官方 CDN 或自定义 JS 组件，在网站右下角生成聊天窗口，将用户消息转发到 n8n Webhook

## 博客场景：内容型网站的智能客服搭建

博客类网站的核心需求是：**让访客用自然语言“搜索”文章内容**。与传统搜索引擎的关键词匹配不同，RAG 智能客服能理解语义，即使访客不记得具体关键词，也能找到相关文章

### 3.1 知识库准备

在 n8n 中创建一个**定时触发**的工作流，自动将博客文章同步到向量数据库：

-   使用 HTTP Request 或 RSS 节点获取最新文章
    
-   提取 HTML 正文并转换为 Markdown
    
-   通过 Character Text Splitter 将长文切分为约 500 字符的块（重叠 50 字符，保持语义连贯）
    
-   生成 OpenAI Embedding 并存入 Pinecone（或 Qdrant、Supabase Vector）

**关键配置**：为每个向量块附加 metadata（文章标题、URL），这样 AI 回答时可以引用来源。

### 3.2 对话工作流

创建第二个工作流处理实时对话：

-   **Chat Trigger**：接收用户消息，开启“Make Chat Publicly Available”
    
-   **AI Agent**：连接 OpenAI Chat Model，配置系统提示词，例如：“你是 \[博客名\] 的 AI 助手。仅根据知识库内容回答，超出范围时礼貌引导访客回到相关主题。”
    
-   **Vector Store Tool**：连接 Pinecone，让 Agent 能够检索知识库
    
-   **Simple Memory**：连接 Window Buffer Memory，保留最近 10 条对话上下文

### 3.3 嵌入博客

n8n 提供了开箱即用的嵌入代码。将以下代码添加到博客的 Footer 中（WordPress 可使用“Insert Headers and Footers”插件）：

html

<link href\="https://cdn.jsdelivr.net/npm/@n8n/chat/dist/style.css" rel\="stylesheet" />
<script type\="module"\>
  import { createChat } from 'https://cdn.jsdelivr.net/npm/@n8n/chat/dist/chat.bundle.es.js';
  createChat({
    webhookUrl: 'https://你的n8n域名/webhook/你的-webhook-id/chat',
    title: 'AI 助手',
    initialMessages: \['你好！我是本站 AI 助手，可以帮你查找文章内容。'\]
  });
</script\>

**常见坑**：如果博客域名和 n8n 域名不同，需要在 Chat Trigger 的 CORS 设置中允许博客域名，否则浏览器会阻止请求。

## 4\. 电商门户场景：从“能回答”到“能办事”

电商网站的客服需求比博客复杂得多：用户不仅问“退货政策是什么”，还会问“我的订单到哪了”“这款有货吗”。n8n 的电商模板展示了如何让 AI Agent 同时具备**知识检索**和**实时数据查询**能力。

### 4.1 知识库 + 实时数据的双轨制

电商客服的知识来源分为两类：

| 知识类型 | 存储方式 | 示例查询 |
| --- | --- | --- |
| 静态知识 | 向量数据库（Qdrant/Pinecone） | 退换货政策、尺码指南 |
| 实时数据 | API 直连（WooCommerce/Shopify） | 库存、价格、订单状态 |

在 n8n 工作流中，AI Agent 会同时拥有两个工具：`rag_search`（查静态知识）和 `get_product`（查实时数据）。Agent 根据用户意图自动选择调用哪个工具。

### 4.2 WooCommerce 集成示例

以 n8n 官方的**WooCommerce 电商客服工作流**为例：

-   **Chat Trigger** 接收用户消息
    
-   **Guardrails 节点**过滤不当内容，保护品牌安全
    
-   **AI Agent** 可调用以下工具：
    
    -   `rag_search`：从 Qdrant 检索公司政策、FAQ
        
    -   `get_product`：从 WooCommerce 获取实时商品信息
        
    -   `get_many_products`：搜索多个商品
        
    -   `get_human_support`：通过 Gmail 转人工客服
        
-   **Memory** 保持 10 条对话上下文，实现多轮产品咨询

### 4.3 人工升级机制

AI 客服不可能解决所有问题。当 Agent 判断无法处理时（如复杂投诉、订单纠纷），应自动升级到人工：

-   在 AI Agent 的提示词中定义升级触发条件
    
-   配置 Gmail 或 Slack 节点，将对话记录和客户联系方式发送给支持团队


### 4.4 嵌入电商网站

电商网站通常需要更高的嵌入灵活性。以下方案按“轻量到重量”排列：

**方案 A：WordPress 插件（零代码）**

如果你的电商基于 WordPress/WooCommerce，可以直接安装免费插件：

-   **Chatics**：将 n8n Webhook URL 粘贴到插件设置，聊天窗口自动出现在网站右下角[\-2](https://ga.wordpress.org/plugins/n8n-chatbot/)
    
-   **Flexible Chat**：支持流式响应、话题路由、文件上传，可直接连接 n8n HTTP Webhook[\-19](https://tw.wordpress.org/plugins/flexible-chat/)

**方案 B：通用 JS 组件（任意网站）**

对于非 WordPress 的自定义网站，使用轻量级 JS 组件：

-   **n8n 官方 CDN**：一行 script 标签即可[\-15](https://oheng.com/build-a-dedicated-ai-customer-service-for-wordpress-at-zero-cost/)
    
-   **juansebsol/n8n-chatbot-template**：可自托管的 JS 文件，支持颜色、品牌、位置自定义，通过配置对象设置 Webhook URL[\-11](https://github.com/juansebsol/n8n-chatbot-template#1)

## 5\. 其他网站的通用嵌入模式

无论网站是 Typecho、Hexo、Webflow 还是自定义后端，嵌入逻辑是一致的：**前端 UI + Webhook 桥接**。

### 5.1 通用集成公式

text

网站前端 → (AJAX/fetch) → n8n Webhook → AI Agent → 返回响应

n8n 的 Chat Trigger 提供两种模式[\-2](https://ga.wordpress.org/plugins/n8n-chatbot/)：

-   **Hosted Chat**：n8n 托管聊天界面，适合快速测试
    
-   **Embedded/Webhook**：返回 Webhook URL，由网站自行构建前端

### 5.2 跨平台适配建议

| 网站类型 | 推荐嵌入方式 |
| --- | --- |
| WordPress | Chatics / Flexible Chat 插件 |
| Shopify | 自定义 Liquid 模板 + JS 组件 |
| Webflow | Embed 组件中粘贴 n8n CDN 脚本 |
| 自定义前端 | 使用 n8n-chatbot-template 或自行实现 |
| 多平台统一 | 自建 Netlify/Cloudflare Function 作为中间层 |

**中间层方案**（适合多网站共用一套 n8n 后端）：在 Netlify Functions 或 Cloudflare Workers 中部署一个轻量 API 代理，前端调用代理，代理再转发到 n8n。这样可以在代理层做鉴权、限流、日志记录，同时隐藏 n8n 的真实地址[\-13](https://github.com/CenredJun/Cenred-AI-Support-Agent/blob/main/README.md#1)。

### 5.3 对话记忆与 Session 管理

无论哪个平台，多轮对话的连续性都依赖 **Session ID**：

-   前端在 localStorage 中生成并存储 UUID
    
-   每次请求携带 `sessionId` 和 `chatInput`
    
-   n8n 的 Memory 节点根据 sessionId 区分不同用户的对话历史[\-11](https://github.com/juansebsol/n8n-chatbot-template#1)[\-16](https://os.wordpress.org/plugins/boopixel-ai-chat-for-n8n/)

n8n Web Chat 组件会自动处理 Session，如果使用自定义前端，需要确保 Session ID 在页面刷新后保持不变。

## 6\. 从“能用”到“好用”的关键细节

**CORS 配置**：Embedded 模式下，必须在 Chat Trigger 的 “Allowed Origins” 中添加网站域名，否则浏览器控制台会报 CORS 错误[\-15](https://oheng.com/build-a-dedicated-ai-customer-service-for-wordpress-at-zero-cost/)。

**知识库新鲜度**：博客和电商的商品信息会变化，建议设置定时 ingestion（如每天凌晨），自动重新抓取并更新向量库[\-5](https://n8n.io/workflows/12981-turn-any-website-into-an-ai-support-chatbot-with-openai-and-pinecone/#1)。

**防幻觉**：在 AI Agent 的系统提示词中明确要求“仅基于检索到的内容回答，不知道就说不知道”。RAG 架构本身已经大幅降低了幻觉风险，但提示词的约束仍然必要[\-5](https://n8n.io/workflows/12981-turn-any-website-into-an-ai-support-chatbot-with-openai-and-pinecone/#1)。

**成本控制**：Embedding 生成和 Chat 调用都消耗 OpenAI API 额度。使用 `gpt-4o-mini` 或 `Gemini Flash` 可以显著降低成本，对于博客级别的流量，每月费用通常在 $5-15 之间[\-10](https://n8n.io/workflows/5387-automate-customer-support-and-calendar-bookings-with-openai-gpt-and-google-calendar/#1)。

**首条消息体验**：配置 `initialMessages` 让聊天窗口打开时就有欢迎语，而不是空白输入框。对于电商场景，可以引导用户选择话题（“查订单 / 找商品 / 售后问题”），再路由到不同的 AI Agent 子模块[\-19](https://tw.wordpress.org/plugins/flexible-chat/)。

## 7\. 总结

n8n 智能客服的通用架构可以浓缩为一句话：**用 RAG 把网站变成知识库，用 AI Agent 把知识库变成对话，用 Webhook 把对话嵌入任何地方。**

博客场景验证了“内容检索”的核心价值，电商场景则展示了“知识 + 实时数据 + 人工升级”的完整闭环。无论网站类型如何，n8n 的 Chat Trigger 和标准化 Webhook 接口都提供了统一的嵌入路径。对于想摆脱 SaaS 订阅、同时保持数据自主权的团队，这是一个值得投入的方案。
