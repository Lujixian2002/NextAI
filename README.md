# NextAI

<p align="center">
  A course-material learning assistant that turns multiple PDFs into cited Q&A, knowledge maps, review packs, and a lightweight study agent.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Frontend-React%2018-61DAFB?logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/Backend-Express-000000?logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/RAG-Multi%20Document-29594A" alt="RAG">
  <img src="https://img.shields.io/badge/AI-LangChain%20%2B%20OpenAI-10A37F" alt="LangChain + OpenAI">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white" alt="Node.js">
</p>

<p align="center">
  <a href="./README.zh-CN.md">中文文档</a>
</p>

## Overview

NextAI is now a course-oriented RAG project instead of a single-PDF Q&A demo.

Core workflow:
1. Create a course workspace.
2. Upload multiple PDFs for the same course.
3. Persist course chunks into Postgres + pgvector.
4. Ask cited questions across all materials.
5. Generate knowledge maps, review outlines, quizzes, and lightweight agent plans.

## Features

- Multi-document course management
- Persistent vector storage with Postgres + pgvector
- Course-level retrieval across all uploaded PDFs
- Cited Q&A with document title and page number
- Knowledge-point extraction and study tips
- Review pack generation with quiz questions
- Lightweight study agent that routes between Q&A, knowledge map, and review tools

## Project Structure

```text
NextAI/
├─ client/                  # React frontend
│  ├─ src/App.js            # Main course workspace UI
│  ├─ src/api.js            # Frontend API client
│  └─ src/components/       # Sidebar + conversation components
├─ server/                  # Express backend
│  ├─ server.js             # API entry
│  ├─ courseStore.js        # Course metadata persistence
│  ├─ vectorStore.js        # Postgres + pgvector integration
│  ├─ chat.js               # RAG, knowledge map, review pack, agent logic
│  ├─ uploads/              # Uploaded PDFs (runtime)
│  └─ data/                 # Course metadata JSON (runtime)
├─ docker-compose.yml       # Local pgvector database for development
├─ package.json             # Root scripts
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

### 2) Start Postgres + pgvector

```bash
docker compose up -d
```

### 3) Configure environment variables

Create `server/.env`:

```env
OPENAI_API_KEY=your_openai_api_key
OPENAI_CHAT_MODEL=gpt-3.5-turbo
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_EMBEDDING_DIMENSIONS=1536
PGVECTOR_DATABASE_URL=postgresql://nextai:nextai@127.0.0.1:5432/nextai
```

Notes:
- `OPENAI_API_KEY` is required.
- `OPENAI_CHAT_MODEL` is optional.
- `OPENAI_EMBEDDING_MODEL` defaults to `text-embedding-3-small`.
- `PGVECTOR_DATABASE_URL` is the simplest way to configure Postgres.
- If you use the included `docker-compose.yml`, Postgres defaults already match `nextai / nextai / nextai`, so only `OPENAI_API_KEY` is strictly required.

Optional frontend override in `client/.env`:

```env
REACT_APP_API_BASE_URL=http://localhost:5001
```

You can also copy from `server/.env.example` and `client/.env.example`.

### 4) Run the app

```bash
npm run dev
```

Default URLs:
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:5001`

## API Reference

Base URL: `http://localhost:5001`

### `GET /courses`

List existing course workspaces.

### `POST /courses`

Create a course workspace.

```json
{
  "title": "CS 180",
  "code": "CS180",
  "description": "Algorithms lecture slides and review notes"
}
```

### `POST /courses/:courseId/documents`

Upload one or more PDFs for a course.

- Content type: `multipart/form-data`
- Field name: `files`

### `POST /courses/:courseId/chat`

Ask a cited question across all course materials.

```json
{
  "question": "What is the key idea behind dynamic programming?",
  "history": []
}
```

### `POST /courses/:courseId/knowledge-map`

Generate a knowledge map for the whole course or a focused topic.

### `POST /courses/:courseId/review-pack`

Generate a revision outline and quiz set.

### `POST /courses/:courseId/agent`

Run the lightweight study agent for a task such as:
- "Summarize recursion and give me four practice questions."
- "Build a review outline for the midterm."

## Scripts

Root:

```bash
npm run dev
npm run client
npm run server
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

## Current Limitations

- The runtime course metadata store is a local JSON file.
- The retriever is optimized for text-based PDFs, not OCR-heavy scanned slides.
- The lightweight agent routes tools but does not run open-ended long-horizon workflows.
- Course updates currently trigger a full course re-index for consistency.
