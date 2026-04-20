import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  answerCourseQuestion,
  clearCourseCache,
  generateKnowledgeMap,
  generateReviewPack,
  purgeCourseVectors,
  runLightweightAgent,
  warmCourseCache,
} from "./chat.js";
import {
  addDocumentsToCourse,
  createCourse,
  getCourseOrThrow,
  listCourses,
  removeDocumentFromCourse,
} from "./courseStore.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, "uploads");

fs.mkdirSync(uploadsDir, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const sanitizeBaseName = (name) =>
  name.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-{2,}/g, "-").slice(0, 60);

const storage = multer.diskStorage({
  destination(req, file, callback) {
    const courseDir = path.join(uploadsDir, req.params.courseId || "general");
    fs.mkdirSync(courseDir, { recursive: true });
    callback(null, courseDir);
  },
  filename(req, file, callback) {
    const extension = path.extname(file.originalname || "").toLowerCase() || ".pdf";
    const rawBaseName = path.basename(file.originalname, extension) || "material";
    const safeBaseName = sanitizeBaseName(rawBaseName) || "material";
    callback(null, `${Date.now()}-${safeBaseName}${extension}`);
  },
});

const upload = multer({
  storage,
  fileFilter(req, file, callback) {
    const extension = path.extname(file.originalname || "").toLowerCase();

    if (file.mimetype === "application/pdf" || extension === ".pdf") {
      callback(null, true);
      return;
    }

    callback(new Error("Only PDF files are supported."));
  },
});

const PORT = 5001;

const toCourseResponse = (course) => ({
  ...course,
  documentCount: course.documents?.length || 0,
  totalBytes: (course.documents || []).reduce(
    (sum, document) => sum + (document.size || 0),
    0,
  ),
});

const cleanupFiles = async (files = []) => {
  await Promise.all(
    files.map(async (file) => {
      if (!file?.path) {
        return;
      }

      try {
        await fsPromises.unlink(file.path);
      } catch (error) {
        if (error.code !== "ENOENT") {
          console.error(`Failed to remove file ${file.path}:`, error);
        }
      }
    }),
  );
};

const getStatusCode = (error) => {
  if (!error?.message) {
    return 500;
  }

  if (
    error.message.includes("not found") ||
    error.message.includes("Course not found")
  ) {
    return 404;
  }

  if (
    error.message.includes("required") ||
    error.message.includes("supported") ||
    error.message.includes("Upload")
  ) {
    return 400;
  }

  return 500;
};

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/courses", async (req, res) => {
  try {
    const courses = await listCourses();
    res.json(courses.map(toCourseResponse));
  } catch (error) {
    res.status(getStatusCode(error)).json({ message: error.message });
  }
});

app.post("/courses", async (req, res) => {
  try {
    const course = await createCourse(req.body || {});
    res.status(201).json(toCourseResponse(course));
  } catch (error) {
    res.status(getStatusCode(error)).json({ message: error.message });
  }
});

app.post(
  "/courses/:courseId/documents",
  upload.array("files", 10),
  async (req, res) => {
    try {
      await getCourseOrThrow(req.params.courseId);

      if (!req.files?.length) {
        return res
          .status(400)
          .json({ message: "Upload at least one PDF for this course." });
      }

      const { course, documents } = await addDocumentsToCourse(
        req.params.courseId,
        req.files,
      );

      try {
        await warmCourseCache(req.params.courseId);
      } catch (error) {
        await Promise.all(
          documents.map((document) =>
            removeDocumentFromCourse(req.params.courseId, document.id),
          ),
        );
        await cleanupFiles(req.files);
        clearCourseCache(req.params.courseId);
        throw error;
      }

      return res.status(201).json({
        course: toCourseResponse(course),
        documents,
      });
    } catch (error) {
      await cleanupFiles(req.files);
      return res.status(getStatusCode(error)).json({ message: error.message });
    }
  },
);

app.delete("/courses/:courseId/documents/:documentId", async (req, res) => {
  try {
    const { course, document } = await removeDocumentFromCourse(
      req.params.courseId,
      req.params.documentId,
    );

    const absolutePath = path.join(__dirname, document.relativePath);
    await cleanupFiles([{ path: absolutePath }]);
    clearCourseCache(req.params.courseId);

    if (!course.documents?.length) {
      await purgeCourseVectors(req.params.courseId);
    }

    res.json({
      course: toCourseResponse(course),
      removedDocumentId: document.id,
    });
  } catch (error) {
    res.status(getStatusCode(error)).json({ message: error.message });
  }
});

app.post("/courses/:courseId/chat", async (req, res) => {
  try {
    const result = await answerCourseQuestion(
      req.params.courseId,
      req.body?.question,
      req.body?.history,
    );
    res.json(result);
  } catch (error) {
    res.status(getStatusCode(error)).json({ message: error.message });
  }
});

app.post("/courses/:courseId/knowledge-map", async (req, res) => {
  try {
    const result = await generateKnowledgeMap(
      req.params.courseId,
      req.body?.focus || "",
    );
    res.json(result);
  } catch (error) {
    res.status(getStatusCode(error)).json({ message: error.message });
  }
});

app.post("/courses/:courseId/review-pack", async (req, res) => {
  try {
    const result = await generateReviewPack(
      req.params.courseId,
      req.body?.focus || "",
    );
    res.json(result);
  } catch (error) {
    res.status(getStatusCode(error)).json({ message: error.message });
  }
});

app.post("/courses/:courseId/agent", async (req, res) => {
  try {
    const result = await runLightweightAgent(
      req.params.courseId,
      req.body?.task,
      req.body?.history,
    );
    res.json(result);
  } catch (error) {
    res.status(getStatusCode(error)).json({ message: error.message });
  }
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    res.status(400).json({ message: error.message });
    return;
  }

  if (error) {
    res.status(getStatusCode(error)).json({ message: error.message });
    return;
  }

  next();
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
