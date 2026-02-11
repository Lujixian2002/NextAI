# NextAI（中文文档）

一个前后端分离的 PDF 问答 Demo：
- 前端：React（Create React App）
- 后端：Express + LangChain + OpenAI
- 功能：上传 PDF 后，对文档内容进行问答

## 项目结构

```text
NextAI/
├─ client/                 # React 前端
├─ server/                 # Express 后端
│  ├─ server.js            # API 入口
│  ├─ chat.js              # LangChain 问答逻辑
│  └─ uploads/             # 上传文件目录（运行时）
├─ package.json            # 根脚本（并行启动前后端）
└─ README.md
```

## 环境要求

- Node.js >= 18（建议 20+）
- npm >= 9
- 可用的 OpenAI API Key

## 安装依赖

在项目根目录执行：

```bash
npm install
npm install --prefix client
npm install --prefix server
```

## 环境变量

在 `server/.env` 中配置：

```env
OPENAI_API_KEY=your_openai_api_key
```

说明：
- 后端优先读取 `OPENAI_API_KEY`。
- 兼容读取 `REACT_APP_OPENAI_API_KEY`，但建议统一用 `OPENAI_API_KEY`。

## 启动项目

### 一键启动前后端

```bash
npm run dev
```

### 分别启动

```bash
# 启动前端（默认 http://localhost:3000）
npm run start --prefix client

# 启动后端（默认 http://localhost:5001）
npm run dev --prefix server
```

## API 说明（后端）

后端默认端口：`5001`

### 1) 上传文件

- 方法：`POST /upload`
- Content-Type：`multipart/form-data`
- 字段名：`file`

示例：

```bash
curl -X POST http://localhost:5001/upload \
  -F "file=@/absolute/path/to/your.pdf"
```

### 2) 文档问答

- 方法：`GET /chat`
- 参数：`question`（query string）

示例：

```bash
curl "http://localhost:5001/chat?question=这份文档主要讲了什么？"
```

## 常见问题

1. `nodemon` 报 `EMFILE: too many open files`
- 已在脚本中使用受限监听范围和 `-L` 选项。
- 使用 `npm run dev --prefix server` 启动即可。

2. 报 `Missing OPENAI_API_KEY in server/.env`
- 检查 `server/.env` 是否存在，且变量名是否为 `OPENAI_API_KEY`。

3. 前端请求不到后端
- 确认后端已在 `http://localhost:5001` 启动。
- 确认前端请求地址与端口一致。

## 可用脚本

根目录：

```bash
npm run dev      # 并行启动 client + server
npm run client   # 只启动前端
npm run server   # 只启动后端（dev）
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
