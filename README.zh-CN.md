# NextAI（中文文档）

现在的 NextAI 已经从“单个 PDF 问答 Demo”升级成了一个面向课程资料的学习助手。

它支持：
- 一门课下管理多份 PDF 资料
- 基于整门课资料进行引用式问答
- 自动梳理知识点
- 自动生成复习提纲和练习题
- 通过轻量 Agent 在问答、知识图谱、复习包之间做简单调度

## 项目定位

适合上传：
- lecture slides
- reading notes
- assignment instructions
- review sheets

核心流程：
1. 创建课程空间
2. 上传同一门课的多份 PDF
3. 将课程切片持久化到 Postgres + pgvector
4. 进行带引用的课程问答
5. 生成知识点梳理、复习提纲和自动练习题

## 项目结构

```text
NextAI/
├─ client/                  # React 前端
│  ├─ src/App.js            # 课程工作台主界面
│  ├─ src/api.js            # 前端接口封装
│  └─ src/components/       # 侧边栏、对话流等组件
├─ server/                  # Express 后端
│  ├─ server.js             # API 入口
│  ├─ courseStore.js        # 课程元数据存储
│  ├─ vectorStore.js        # Postgres + pgvector 向量层
│  ├─ chat.js               # RAG / 知识点 / 复习包 / Agent 逻辑
│  ├─ uploads/              # 上传 PDF（运行时）
│  └─ data/                 # 课程数据 JSON（运行时）
├─ docker-compose.yml       # 本地 pgvector 数据库
├─ package.json
├─ README.md
└─ README.zh-CN.md
```

## 环境要求

- Node.js >= 18
- npm >= 9
- 可用的 OpenAI API Key

## 安装依赖

```bash
npm install
npm install --prefix client
npm install --prefix server
```

## 启动 Postgres + pgvector

```bash
docker compose up -d
```

## 环境变量

在 `server/.env` 中配置：

```env
OPENAI_API_KEY=your_openai_api_key
OPENAI_CHAT_MODEL=gpt-3.5-turbo
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_EMBEDDING_DIMENSIONS=1536
PGVECTOR_DATABASE_URL=postgresql://nextai:nextai@127.0.0.1:5432/nextai
```

说明：
- `OPENAI_API_KEY` 必填
- `OPENAI_CHAT_MODEL` 可选
- `OPENAI_EMBEDDING_MODEL` 默认使用 `text-embedding-3-small`
- `PGVECTOR_DATABASE_URL` 是最简单的 Postgres 配置方式
- 如果你直接使用仓库里的 `docker-compose.yml`，Postgres 默认账号就是 `nextai / nextai / nextai`，所以严格来说只配 `OPENAI_API_KEY` 也可以启动

前端可选配置 `client/.env`：

```env
REACT_APP_API_BASE_URL=http://localhost:5001
```

也可以直接参考 `server/.env.example` 和 `client/.env.example`。

## 启动项目

```bash
npm run dev
```

默认地址：
- 前端：`http://localhost:3000`
- 后端：`http://localhost:5001`

## 主要接口

后端默认端口：`5001`

### `GET /courses`

获取课程空间列表。

### `POST /courses`

创建课程空间。

### `POST /courses/:courseId/documents`

上传课程 PDF 资料。

- Content-Type：`multipart/form-data`
- 字段名：`files`

### `POST /courses/:courseId/chat`

针对整门课资料进行引用式问答。

### `POST /courses/:courseId/knowledge-map`

生成课程整体或指定主题的知识图谱。

### `POST /courses/:courseId/review-pack`

生成复习提纲、必背点和练习题。

### `POST /courses/:courseId/agent`

运行轻量学习 Agent，例如：
- “先帮我梳理 recursion 的知识点，再出 4 道题”
- “给我做一份 midterm review pack”

## 可用脚本

根目录：

```bash
npm run dev
npm run client
npm run server
```

前端（`client/`）：

```bash
npm run start
npm run build
npm run test
```

后端（`server/`）：

```bash
npm run dev
npm run start
```

## 当前限制

- 课程元数据目前保存在本地 JSON 文件
- 更适合文本型 PDF，对扫描件/OCR 型课件支持还不够强
- 当前 Agent 是轻量路由式 Agent，还不是长链路自治 Agent
- 为了保证一致性，课程资料一旦变更，目前会触发整门课的重新索引
