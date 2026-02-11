# NextAI

<p align="center">
  Upload a PDF, ask natural-language questions, and get concise answers powered by LangChain + OpenAI.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Frontend-React%2018-61DAFB?logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/Backend-Express-000000?logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/AI-LangChain-1C3C3C" alt="LangChain">
  <img src="https://img.shields.io/badge/Model-OpenAI-10A37F?logo=openai&logoColor=white" alt="OpenAI">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white" alt="Node.js">
</p>

<p align="center">
  <a href="./README.zh-CN.md">中文文档</a>
</p>

## Overview

NextAI is a full-stack PDF Q&A demo:
- Frontend: React (Create React App)
- Backend: Express + LangChain
- LLM Provider: OpenAI

Flow:
1. Upload a PDF to the server.
2. Split document text into chunks.
3. Build embeddings and an in-memory vector store.
4. Ask questions and retrieve context-aware answers.

## Project Structure

```text
NextAI/
├─ client/                  # React frontend
├─ server/                  # Express backend
│  ├─ server.js             # API entry
│  ├─ chat.js               # LangChain retrieval + QA logic
│  └─ uploads/              # Runtime upload directory
├─ package.json             # Root scripts (run frontend + backend together)
├─ README.md
└─ README.zh-CN.md
```

## Quick Start

### 1) Install dependencies

```bash
npm install
npm install --prefix client
npm install --prefix server
```

### 2) Configure environment variables

Create `server/.env`:

```env
OPENAI_API_KEY=your_openai_api_key
```

Notes:
- `OPENAI_API_KEY` is the preferred key.
- `REACT_APP_OPENAI_API_KEY` is still accepted for backward compatibility.

### 3) Run the app

Run frontend + backend together:

```bash
npm run dev
```

Or run them separately:

```bash
# Frontend: http://localhost:3000
npm run start --prefix client

# Backend: http://localhost:5001
npm run dev --prefix server
```

## API Reference

Base URL: `http://localhost:5001`

### `POST /upload`

Upload a PDF file.

- Content type: `multipart/form-data`
- Field name: `file`

```bash
curl -X POST http://localhost:5001/upload \
  -F "file=@/absolute/path/to/your.pdf"
```

### `GET /chat?question=...`

Ask a question against the uploaded PDF.

```bash
curl "http://localhost:5001/chat?question=What is this document about?"
```

## Scripts

Root:

```bash
npm run dev      # Start client + server in parallel
npm run client   # Start frontend only
npm run server   # Start backend only (dev mode)
```

Client (`client/`):

```bash
npm run start
npm run build
npm run test
```

Server (`server/`):

```bash
npm run dev
npm run start
```

## Troubleshooting

### `EMFILE: too many open files` (nodemon)

The backend dev script already uses a reduced watch scope and legacy mode:
`nodemon -L --watch server.js --watch chat.js server.js`.

### `Missing OPENAI_API_KEY in server/.env`

Make sure `server/.env` exists and contains:

```env
OPENAI_API_KEY=...
```

### Frontend cannot reach backend

Check:
- Backend is running on `http://localhost:5001`
- Frontend API target points to port `5001`

## Roadmap

- Persist vector store to disk/database
- Add multi-file upload and document management
- Add auth + per-user document isolation
- Improve prompt templates and answer citation

