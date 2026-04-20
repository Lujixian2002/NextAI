import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import { ChatOpenAI } from "@langchain/openai";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { getCourseOrThrow } from "./courseStore.js";
import {
  deleteCourseVectors,
  isCourseIndexCurrent,
  replaceCourseVectors,
  searchCourseVectors,
} from "./vectorStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const indexedCourseCache = new Map();
const pendingCourseSyncs = new Map();

const getOpenAIApiKey = () => {
  const openAIApiKey = process.env.OPENAI_API_KEY;

  if (!openAIApiKey) {
    throw new Error("Missing OPENAI_API_KEY in server/.env");
  }

  return openAIApiKey;
};

const getChatModelName = () =>
  process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_MODEL || "gpt-3.5-turbo";

const createChatModel = (temperature = 0.2) =>
  new ChatOpenAI({
    modelName: getChatModelName(),
    openAIApiKey: getOpenAIApiKey(),
    temperature,
  });

const getCourseCacheKey = (course) =>
  `${course.id}:${course.contentVersion || 0}:${course.documents.length}`;

const invalidateCourseCache = (courseId) => {
  for (const key of [...indexedCourseCache.keys()]) {
    if (key.startsWith(`${courseId}:`)) {
      indexedCourseCache.delete(key);
    }
  }

  for (const key of [...pendingCourseSyncs.keys()]) {
    if (key.startsWith(`${courseId}:`)) {
      pendingCourseSyncs.delete(key);
    }
  }
};

const resolveDocumentPath = (courseDocument) =>
  path.isAbsolute(courseDocument.relativePath)
    ? courseDocument.relativePath
    : path.join(__dirname, courseDocument.relativePath);

const extractPageNumber = (metadata, fallbackPageNumber) =>
  metadata?.loc?.pageNumber ||
  metadata?.pageNumber ||
  metadata?.pdf?.pageNumber ||
  fallbackPageNumber;

const normalizeWhitespace = (value = "") => value.replace(/\s+/g, " ").trim();

const trimForPrompt = (value, maxLength = 1400) =>
  normalizeWhitespace(value).slice(0, maxLength);

const ensureStringArray = (value) =>
  Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];

const parseJsonBlock = (text) => {
  if (!text) {
    return null;
  }

  const cleaned = text
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();

  const candidates = [cleaned];
  const objectStart = cleaned.indexOf("{");
  const objectEnd = cleaned.lastIndexOf("}");

  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(cleaned.slice(objectStart, objectEnd + 1));
  }

  const arrayStart = cleaned.indexOf("[");
  const arrayEnd = cleaned.lastIndexOf("]");

  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    candidates.push(cleaned.slice(arrayStart, arrayEnd + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      continue;
    }
  }

  return null;
};

const getMessageText = (content) => {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (typeof item?.text === "string") {
          return item.text;
        }

        return "";
      })
      .join("\n");
  }

  if (content == null) {
    return "";
  }

  return String(content);
};

const askForJson = async (prompt, fallbackFactory, temperature = 0.2) => {
  const message = await createChatModel(temperature).invoke(prompt);
  const text = getMessageText(message.content);
  const parsed = parseJsonBlock(text);

  if (parsed && typeof parsed === "object") {
    return parsed;
  }

  return fallbackFactory(text);
};

const buildCourseChunkDocuments = async (course) => {
  if (!course.documents?.length) {
    throw new Error("Upload course materials before using the assistant.");
  }

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 700,
    chunkOverlap: 120,
  });
  const chunks = [];

  for (const courseDocument of course.documents) {
    const filePath = resolveDocumentPath(courseDocument);
    await fs.access(filePath);

    const loader = new PDFLoader(filePath);
    const rawPages = await loader.load();
    const normalizedPages = rawPages.map(
      (page, pageIndex) =>
        new Document({
          pageContent: page.pageContent,
          metadata: {
            ...page.metadata,
            courseId: course.id,
            courseTitle: course.title,
            documentId: courseDocument.id,
            documentTitle: courseDocument.name,
            contentVersion: String(course.contentVersion || 0),
            pageNumber: extractPageNumber(page.metadata, pageIndex + 1),
          },
        }),
    );
    const splitDocs = await textSplitter.splitDocuments(normalizedPages);

    splitDocs.forEach((chunk, chunkIndex) => {
      chunks.push(
        new Document({
          pageContent: chunk.pageContent,
          metadata: {
            ...chunk.metadata,
            courseId: course.id,
            courseTitle: course.title,
            documentId: courseDocument.id,
            documentTitle: courseDocument.name,
            contentVersion: String(course.contentVersion || 0),
            pageNumber: extractPageNumber(
              chunk.metadata,
              chunk.metadata?.pageNumber || 1,
            ),
            chunkIndex,
          },
        }),
      );
    });
  }

  return chunks;
};

const ensureCourseIndexed = async (courseId) => {
  const course = await getCourseOrThrow(courseId);
  const cacheKey = getCourseCacheKey(course);
  const cachedCourse = indexedCourseCache.get(cacheKey);

  if (cachedCourse) {
    return cachedCourse;
  }

  const pendingSync = pendingCourseSyncs.get(cacheKey);

  if (pendingSync) {
    return pendingSync;
  }

  const syncPromise = (async () => {
    const alreadyIndexed = await isCourseIndexCurrent(course);

    if (!alreadyIndexed) {
      const chunks = await buildCourseChunkDocuments(course);
      await replaceCourseVectors(course, chunks);
    }

    return course;
  })()
    .then((currentCourse) => {
      invalidateCourseCache(course.id);
      indexedCourseCache.set(cacheKey, currentCourse);
      return currentCourse;
    })
    .finally(() => {
      pendingCourseSyncs.delete(cacheKey);
    });

  pendingCourseSyncs.set(cacheKey, syncPromise);
  return syncPromise;
};

const dedupeChunks = (chunks) => {
  const seen = new Set();
  const uniqueChunks = [];

  chunks.forEach((chunk) => {
    const key = [
      chunk.metadata?.documentId,
      chunk.metadata?.pageNumber,
      chunk.metadata?.chunkIndex,
    ].join(":");

    if (!seen.has(key)) {
      seen.add(key);
      uniqueChunks.push(chunk);
    }
  });

  return uniqueChunks;
};

const retrieveCourseChunks = async (
  courseId,
  queries,
  { maxChunks = 8, perQuery = 4 } = {},
) => {
  await ensureCourseIndexed(courseId);
  const collectedChunks = [];

  for (const query of queries.map((item) => item?.trim()).filter(Boolean)) {
    const docs = await searchCourseVectors(courseId, query, perQuery);
    collectedChunks.push(...docs);
  }

  return dedupeChunks(collectedChunks).slice(0, maxChunks);
};

const buildContextBlock = (chunks, maxChars = 10000) => {
  let currentLength = 0;
  const sections = [];

  for (const chunk of chunks) {
    const section = [
      `Source: ${chunk.metadata?.documentTitle || "Course Material"} | Page ${
        chunk.metadata?.pageNumber || "?"
      }`,
      trimForPrompt(chunk.pageContent, 1800),
    ].join("\n");

    if (currentLength + section.length > maxChars && sections.length > 0) {
      break;
    }

    sections.push(section);
    currentLength += section.length;
  }

  return sections.join("\n\n---\n\n");
};

const buildCitations = (chunks, maxCitations = 5) => {
  const seen = new Set();
  const citations = [];

  for (const chunk of chunks) {
    const key = [chunk.metadata?.documentId, chunk.metadata?.pageNumber].join(
      ":",
    );

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    citations.push({
      documentId: chunk.metadata?.documentId,
      documentTitle: chunk.metadata?.documentTitle || "Course Material",
      pageNumber: chunk.metadata?.pageNumber || null,
      excerpt: trimForPrompt(chunk.pageContent, 240),
    });

    if (citations.length >= maxCitations) {
      break;
    }
  }

  return citations;
};

const buildHistoryBlock = (history = []) => {
  if (!Array.isArray(history) || history.length === 0) {
    return "No prior conversation.";
  }

  return history
    .slice(-6)
    .map((message) => {
      const role = message?.role === "assistant" ? "Tutor" : "Student";
      return `${role}: ${trimForPrompt(message?.content || "", 500)}`;
    })
    .join("\n");
};

const normalizeOutline = (outline) =>
  Array.isArray(outline)
    ? outline
        .map((item) => {
          if (typeof item === "string") {
            return {
              title: item,
              items: [],
            };
          }

          return {
            title: item?.title || "Review Topic",
            items: ensureStringArray(item?.items),
          };
        })
        .filter((item) => item.title)
    : [];

const normalizeKeyTerms = (keyTerms) =>
  Array.isArray(keyTerms)
    ? keyTerms
        .map((item) => ({
          term:
            typeof item === "string" ? item : item?.term || item?.title || "",
          explanation:
            typeof item === "string"
              ? ""
              : item?.explanation || item?.summary || "",
        }))
        .filter((item) => item.term)
    : [];

const normalizeQuiz = (quiz) =>
  Array.isArray(quiz)
    ? quiz
        .map((item) => ({
          type: item?.type || "short_answer",
          question: item?.question || "",
          answer: item?.answer || "",
          explanation: item?.explanation || "",
        }))
        .filter((item) => item.question && item.answer)
    : [];

export const warmCourseCache = async (courseId) => {
  await ensureCourseIndexed(courseId);
};

export const clearCourseCache = (courseId) => {
  invalidateCourseCache(courseId);
};

export const purgeCourseVectors = async (courseId) => {
  await deleteCourseVectors(courseId);
};

export const answerCourseQuestion = async (
  courseId,
  question,
  history = [],
) => {
  if (!question?.trim()) {
    throw new Error("Question is required.");
  }

  const course = await getCourseOrThrow(courseId);
  const chunks = await retrieveCourseChunks(courseId, [question], {
    maxChunks: 6,
    perQuery: 6,
  });

  const prompt = `
You are a course learning assistant. Use only the provided course material snippets.
If the snippets do not support the answer, say you do not have enough evidence from the uploaded materials.
Return valid JSON only with this shape:
{
  "answer": "string",
  "knowledgePoints": ["string"],
  "suggestedFollowUps": ["string"]
}

Course title: ${course.title}
Conversation history:
${buildHistoryBlock(history)}

Material snippets:
${buildContextBlock(chunks)}

Student question: ${question}
`;

  const response = await askForJson(
    prompt,
    (text) => ({
      answer: text,
      knowledgePoints: [],
      suggestedFollowUps: [],
    }),
    0.2,
  );

  return {
    mode: "qa",
    question,
    answer:
      typeof response.answer === "string"
        ? response.answer.trim()
        : "I do not have enough evidence from the uploaded materials.",
    knowledgePoints: ensureStringArray(response.knowledgePoints).slice(0, 5),
    suggestedFollowUps: ensureStringArray(response.suggestedFollowUps).slice(
      0,
      3,
    ),
    citations: buildCitations(chunks),
  };
};

export const generateKnowledgeMap = async (courseId, focus = "") => {
  const course = await getCourseOrThrow(courseId);
  const queries = focus
    ? [focus, `${focus} key concepts`, `${focus} definitions formulas examples`]
    : [
        `${course.title} overview`,
        `${course.title} important concepts`,
        "major themes definitions formulas examples",
      ];
  const chunks = await retrieveCourseChunks(courseId, queries, {
    maxChunks: 8,
    perQuery: 4,
  });

  const prompt = `
You are organizing course materials into a study-friendly knowledge map.
Use only the provided snippets and return valid JSON only with this shape:
{
  "overview": "string",
  "modules": [
    {
      "title": "string",
      "summary": "string",
      "knowledgePoints": ["string"]
    }
  ],
  "keyTerms": [
    {
      "term": "string",
      "explanation": "string"
    }
  ],
  "studyTips": ["string"]
}

Course title: ${course.title}
Focus: ${focus || "overall course materials"}

Material snippets:
${buildContextBlock(chunks)}
`;

  const response = await askForJson(
    prompt,
    (text) => ({
      overview: text,
      modules: [],
      keyTerms: [],
      studyTips: [],
    }),
    0.3,
  );

  const modules = Array.isArray(response.modules)
    ? response.modules
        .map((item) => ({
          title: item?.title || "Core Topic",
          summary: item?.summary || "",
          knowledgePoints: ensureStringArray(item?.knowledgePoints).slice(0, 5),
        }))
        .filter((item) => item.title)
    : [];

  return {
    mode: "knowledge_map",
    focus,
    overview:
      typeof response.overview === "string"
        ? response.overview.trim()
        : "Knowledge map generated from the uploaded materials.",
    modules,
    keyTerms: normalizeKeyTerms(response.keyTerms).slice(0, 8),
    studyTips: ensureStringArray(response.studyTips).slice(0, 5),
    citations: buildCitations(chunks),
  };
};

export const generateReviewPack = async (courseId, focus = "") => {
  const course = await getCourseOrThrow(courseId);
  const queries = focus
    ? [focus, `${focus} exam review`, `${focus} practice questions`]
    : [
        `${course.title} exam review`,
        "important topics for revision",
        "practice questions definitions examples",
      ];
  const chunks = await retrieveCourseChunks(courseId, queries, {
    maxChunks: 9,
    perQuery: 4,
  });

  const prompt = `
You are building an exam-prep pack from the uploaded course materials.
Use only the provided snippets and return valid JSON only with this shape:
{
  "focus": "string",
  "outline": [
    {
      "title": "string",
      "items": ["string"]
    }
  ],
  "memorizeFirst": ["string"],
  "quiz": [
    {
      "type": "short_answer | true_false | oral",
      "question": "string",
      "answer": "string",
      "explanation": "string"
    }
  ],
  "checklist": ["string"]
}

Course title: ${course.title}
Focus: ${focus || "overall exam review"}

Material snippets:
${buildContextBlock(chunks)}
`;

  const response = await askForJson(
    prompt,
    (text) => ({
      focus: focus || "overall exam review",
      outline: [],
      memorizeFirst: [text],
      quiz: [],
      checklist: [],
    }),
    0.35,
  );

  return {
    mode: "review_pack",
    focus:
      typeof response.focus === "string"
        ? response.focus.trim()
        : focus || "overall exam review",
    outline: normalizeOutline(response.outline).slice(0, 5),
    memorizeFirst: ensureStringArray(response.memorizeFirst).slice(0, 6),
    quiz: normalizeQuiz(response.quiz).slice(0, 6),
    checklist: ensureStringArray(response.checklist).slice(0, 6),
    citations: buildCitations(chunks),
  };
};

const planByKeywords = (task) => {
  const normalizedTask = task.toLowerCase();
  const wantsKnowledge =
    /(summary|summarize|overview|knowledge|concept|key point|outline|梳理|总结|知识点|重点|概念)/i.test(
      task,
    ) || normalizedTask.includes("module");
  const wantsReview =
    /(quiz|practice|exam|review|flashcard|question|题|复习|考点|练习|提纲|自测)/i.test(
      task,
    );

  if (wantsKnowledge && wantsReview) {
    return [
      { tool: "knowledge_map", input: task },
      { tool: "review_pack", input: task },
    ];
  }

  if (wantsReview) {
    return [{ tool: "review_pack", input: task }];
  }

  if (wantsKnowledge) {
    return [{ tool: "knowledge_map", input: task }];
  }

  return [{ tool: "qa", input: task }];
};

const planWithModel = async (course, task) => {
  const prompt = `
You route requests for a study assistant.
Available tools:
- qa: answer a concrete question with citations
- knowledge_map: organize materials into themes, concepts, and study tips
- review_pack: create a revision outline and quiz

Return valid JSON only with this shape:
{
  "steps": [
    {
      "tool": "qa | knowledge_map | review_pack",
      "input": "string"
    }
  ]
}

Course title: ${course.title}
Student request: ${task}
`;

  const response = await askForJson(
    prompt,
    () => ({ steps: planByKeywords(task) }),
    0,
  );

  const steps = Array.isArray(response.steps)
    ? response.steps
        .map((step) => ({
          tool: step?.tool,
          input: typeof step?.input === "string" ? step.input : task,
        }))
        .filter((step) =>
          ["qa", "knowledge_map", "review_pack"].includes(step.tool),
        )
    : [];

  return steps.length > 0 ? steps.slice(0, 2) : planByKeywords(task);
};

const summarizeArtifact = (artifact) => {
  if (!artifact) {
    return "";
  }

  if (artifact.mode === "qa") {
    return `Answer: ${artifact.answer}`;
  }

  if (artifact.mode === "knowledge_map") {
    return `Overview: ${artifact.overview}`;
  }

  if (artifact.mode === "review_pack") {
    return `Review focus: ${artifact.focus}. Quiz count: ${
      artifact.quiz?.length || 0
    }.`;
  }

  return "";
};

const synthesizeAgentAnswer = async (course, task, artifacts) => {
  if (artifacts.qa && !artifacts.knowledgeMap && !artifacts.reviewPack) {
    return artifacts.qa.answer;
  }

  const prompt = `
You are a concise study assistant summarizing tool outputs for a student.
Write a short response under 140 words that explains what was prepared and how to use it next.

Course title: ${course.title}
Student request: ${task}

Tool outputs:
${Object.values(artifacts)
  .map((artifact) => summarizeArtifact(artifact))
  .filter(Boolean)
  .join("\n")}
`;

  const message = await createChatModel(0.2).invoke(prompt);
  const text = getMessageText(message.content).trim();

  if (text) {
    return text;
  }

  return "I prepared the requested study materials from the uploaded course documents.";
};

export const runLightweightAgent = async (courseId, task, history = []) => {
  if (!task?.trim()) {
    throw new Error("Task is required.");
  }

  const course = await getCourseOrThrow(courseId);
  const keywordPlan = planByKeywords(task);
  const steps =
    keywordPlan.length === 1 && keywordPlan[0].tool === "qa"
      ? await planWithModel(course, task)
      : keywordPlan;
  const toolCalls = [];
  const artifacts = {};

  for (const step of steps.slice(0, 2)) {
    const toolCall = {
      tool: step.tool,
      input: step.input,
      status: "completed",
    };

    if (step.tool === "knowledge_map") {
      artifacts.knowledgeMap = await generateKnowledgeMap(courseId, step.input);
      toolCall.outputPreview = summarizeArtifact(artifacts.knowledgeMap);
    } else if (step.tool === "review_pack") {
      artifacts.reviewPack = await generateReviewPack(courseId, step.input);
      toolCall.outputPreview = summarizeArtifact(artifacts.reviewPack);
    } else {
      artifacts.qa = await answerCourseQuestion(courseId, step.input, history);
      toolCall.outputPreview = summarizeArtifact(artifacts.qa);
    }

    toolCalls.push(toolCall);
  }

  const citations = buildCitations(
    dedupeChunks(
      [
        ...(artifacts.qa?.citations || []).map((citation) => ({
          metadata: {
            documentId: citation.documentId,
            documentTitle: citation.documentTitle,
            pageNumber: citation.pageNumber,
          },
          pageContent: citation.excerpt,
        })),
        ...(artifacts.knowledgeMap?.citations || []).map((citation) => ({
          metadata: {
            documentId: citation.documentId,
            documentTitle: citation.documentTitle,
            pageNumber: citation.pageNumber,
          },
          pageContent: citation.excerpt,
        })),
        ...(artifacts.reviewPack?.citations || []).map((citation) => ({
          metadata: {
            documentId: citation.documentId,
            documentTitle: citation.documentTitle,
            pageNumber: citation.pageNumber,
          },
          pageContent: citation.excerpt,
        })),
      ].map(
        (item) =>
          new Document({
            pageContent: item.pageContent,
            metadata: item.metadata,
          }),
      ),
    ),
  );

  return {
    mode: "agent",
    task,
    answer: await synthesizeAgentAnswer(course, task, artifacts),
    toolCalls,
    artifacts,
    citations,
  };
};
