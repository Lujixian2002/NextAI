import crypto from "crypto";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "data");
const coursesFile = path.join(dataDir, "courses.json");

const defaultDb = { courses: [] };

const ensureStore = () => {
  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(coursesFile)) {
    fs.writeFileSync(coursesFile, JSON.stringify(defaultDb, null, 2));
  }
};

ensureStore();

const readDb = async () => {
  ensureStore();
  const raw = await fsPromises.readFile(coursesFile, "utf8");

  if (!raw.trim()) {
    return { ...defaultDb };
  }

  return JSON.parse(raw);
};

const writeDb = async (db) => {
  await fsPromises.writeFile(coursesFile, JSON.stringify(db, null, 2));
};

const sortByUpdatedAt = (courses) =>
  [...courses].sort(
    (left, right) => new Date(right.updatedAt) - new Date(left.updatedAt),
  );

export const listCourses = async () => {
  const db = await readDb();
  return sortByUpdatedAt(db.courses);
};

export const getCourse = async (courseId) => {
  const db = await readDb();
  return db.courses.find((course) => course.id === courseId) || null;
};

export const getCourseOrThrow = async (courseId) => {
  const course = await getCourse(courseId);

  if (!course) {
    throw new Error("Course not found.");
  }

  return course;
};

export const createCourse = async ({ title, code = "", description = "" }) => {
  const trimmedTitle = title?.trim();

  if (!trimmedTitle) {
    throw new Error("Course title is required.");
  }

  const now = new Date().toISOString();
  const course = {
    id: crypto.randomUUID(),
    title: trimmedTitle,
    code: code.trim(),
    description: description.trim(),
    createdAt: now,
    updatedAt: now,
    contentVersion: 0,
    documents: [],
  };

  const db = await readDb();
  db.courses = sortByUpdatedAt([course, ...db.courses]);
  await writeDb(db);

  return course;
};

export const addDocumentsToCourse = async (courseId, files) => {
  const db = await readDb();
  const courseIndex = db.courses.findIndex((course) => course.id === courseId);

  if (courseIndex < 0) {
    throw new Error("Course not found.");
  }

  const now = new Date().toISOString();
  const nextDocuments = files.map((file) => ({
    id: crypto.randomUUID(),
    name: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    relativePath: path.relative(__dirname, file.path),
    uploadedAt: now,
  }));

  const course = db.courses[courseIndex];
  db.courses[courseIndex] = {
    ...course,
    updatedAt: now,
    contentVersion: (course.contentVersion || 0) + 1,
    documents: [...course.documents, ...nextDocuments],
  };

  db.courses = sortByUpdatedAt(db.courses);
  await writeDb(db);

  return {
    course: db.courses.find((item) => item.id === courseId),
    documents: nextDocuments,
  };
};

export const removeDocumentFromCourse = async (courseId, documentId) => {
  const db = await readDb();
  const courseIndex = db.courses.findIndex((course) => course.id === courseId);

  if (courseIndex < 0) {
    throw new Error("Course not found.");
  }

  const course = db.courses[courseIndex];
  const document = course.documents.find((item) => item.id === documentId);

  if (!document) {
    throw new Error("Document not found.");
  }

  const now = new Date().toISOString();
  db.courses[courseIndex] = {
    ...course,
    updatedAt: now,
    contentVersion: (course.contentVersion || 0) + 1,
    documents: course.documents.filter((item) => item.id !== documentId),
  };

  db.courses = sortByUpdatedAt(db.courses);
  await writeDb(db);

  return {
    course: db.courses.find((item) => item.id === courseId),
    document,
  };
};
