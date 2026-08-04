# AI职场体验舱 v1.0

智联招聘首届全国AI创新大赛参赛作品。通过沉浸式岗位模拟与智能评估，帮助大学生提前感知真实工作场景，找到适合自己的职业方向。

> 在线体验：http://sonata177.online

## 核心功能

- 沉浸式岗位体验：多天制（Day 1/2/3）对话模拟，AI扮演主管、用户、产品经理等角色
- 岗位真相镜：输入JD，AI分析岗位真实情况（职责、技能、风险等）
- 能力评估报告：基于对话表现，生成六维度评估与成长建议
- 随机题目池：每个阶段多套变体，保证重复体验不重复

## 技术栈

- 前端：React 19 + TypeScript + Vite 8、Zustand 状态管理、framer-motion 动画
- 后端：Node.js + Express（代理 DeepSeek API，隔离密钥、CORS 白名单、请求限流）
- 模型：DeepSeek API（OpenAI 兼容，SSE 流式输出）
- 部署：Nginx + Docker Compose（前端静态托管 + 后端反向代理）

## 本地运行

项目分前端和后端两部分，需分别启动。

### 1. 配置后端密钥

复制模板并填入你的 DeepSeek API 密钥：

```bash
cp server/.env.example server/.env
# 编辑 server/.env，填入 DEEPSEEK_API_KEY
```

`server/.env` 字段说明：

```
DEEPSEEK_API_KEY=你的DeepSeek密钥
PORT=3001
ALLOWED_ORIGINS=http://localhost:5173
```

### 2. 启动后端（端口 3001）

```bash
cd server
npm install
node --env-file=.env index.js
```

### 3. 启动前端（端口 5173）

另开一个终端：

```bash
npm install
npm run dev
```

浏览器访问 http://localhost:5173 即可。前端通过 Vite 代理把 `/api` 请求转发到后端。

## 打包构建

```bash
npm run build   # 前端产物输出到 dist/
```

## Docker 部署

服务器需安装 Docker。在项目根目录：

```bash
cp server/.env.example server/.env   # 填入密钥，并把 ALLOWED_ORIGINS 改为线上地址
docker compose up -d --build
```

Nginx 监听 80 端口对外提供服务，并将 `/api` 反向代理到后端容器（3001）。
