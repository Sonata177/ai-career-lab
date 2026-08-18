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

### 1. 配置后端环境变量

复制模板并填入你的 DeepSeek API 密钥：

```bash
cp server/.env.example server/.env
# 编辑 server/.env，填入 DEEPSEEK_API_KEY
```

#### 环境变量总览

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `DEEPSEEK_API_KEY` | ✅ 必填 | 无 | DeepSeek API 密钥。缺失时后端启动会报错退出（`DEEPSEEK_API_KEY environment variable is required`）。密钥只存在于 `server/.env`，仅由后端使用，**不会下发到前端** |
| `PORT` | 可选 | `3001` | 后端监听端口。部署时如与容器端口冲突可修改（需同步 nginx/docker-compose 配置） |
| `ALLOWED_ORIGINS` | 可选 | `http://localhost:5173` | CORS 白名单，**逗号分隔**（不要带空格）。本地开发默认放行 Vite 地址；生产/联调时必须改为线上域名，否则浏览器跨域请求会被拒绝 |

`server/.env` 示例：

```
DEEPSEEK_API_KEY=sk-你的DeepSeek密钥
PORT=3001
ALLOWED_ORIGINS=http://localhost:5173,https://yourdomain.com
```

> 根目录的 `.env` 仅是前端占位文件（不含任何密钥）；`server/.env` 已被 `.gitignore` 忽略（含根 `.env`），不会提交到仓库。

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
cp server/.env.example server/.env   # 填入 DEEPSEEK_API_KEY，并把 ALLOWED_ORIGINS 改为线上域名
docker compose up -d --build
```

Nginx 监听 80 端口对外提供服务，并将 `/api` 反向代理到后端容器（3001）。

> 部署前务必检查 `server/.env`：`DEEPSEEK_API_KEY` 必须为真实密钥，`ALLOWED_ORIGINS` 必须包含你的线上域名（如 `https://yourdomain.com`），否则前端请求会被 CORS 拦截。
