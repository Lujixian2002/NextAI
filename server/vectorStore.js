import { OpenAIEmbeddings } from "@langchain/openai";
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";

const DEFAULT_TABLE_NAME = "course_chunks";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

let vectorStorePromise;
let hnswIndexEnsured = false;

const getOpenAIApiKey = () => {
  const openAIApiKey = process.env.OPENAI_API_KEY;

  if (!openAIApiKey) {
    throw new Error("Missing OPENAI_API_KEY in server/.env");
  }

  return openAIApiKey;
};

const getEmbeddingModelName = () =>
  process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;

const getEmbeddingDimensions = () => {
  const configuredDimensions = Number(process.env.OPENAI_EMBEDDING_DIMENSIONS);

  if (Number.isFinite(configuredDimensions) && configuredDimensions > 0) {
    return configuredDimensions;
  }

  const modelName = getEmbeddingModelName();

  if (modelName === "text-embedding-3-large") {
    return 3072;
  }

  if (
    modelName === "text-embedding-3-small" ||
    modelName === "text-embedding-ada-002"
  ) {
    return 1536;
  }

  return undefined;
};

const getPgConnectionOptions = () => {
  const connectionString =
    process.env.PGVECTOR_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL;

  if (connectionString) {
    return { connectionString };
  }

  const host = process.env.POSTGRES_HOST || "127.0.0.1";
  const port = Number(process.env.POSTGRES_PORT || "5432");
  const user = process.env.POSTGRES_USER || "nextai";
  const password = process.env.POSTGRES_PASSWORD || "nextai";
  const database = process.env.POSTGRES_DB || "nextai";

  return {
    host,
    port,
    user,
    password,
    database,
    ssl:
      process.env.POSTGRES_SSL === "true"
        ? { rejectUnauthorized: false }
        : undefined,
  };
};

const getVectorStoreConfig = () => ({
  postgresConnectionOptions: getPgConnectionOptions(),
  tableName: process.env.PGVECTOR_TABLE_NAME || DEFAULT_TABLE_NAME,
  schemaName: process.env.PGVECTOR_SCHEMA || "public",
  columns: {
    idColumnName: "id",
    vectorColumnName: "embedding",
    contentColumnName: "text",
    metadataColumnName: "metadata",
  },
  distanceStrategy: "cosine",
});

const ensureHnswIndex = async (vectorStore) => {
  if (hnswIndexEnsured || process.env.PGVECTOR_CREATE_INDEX === "false") {
    return;
  }

  const dimensions = getEmbeddingDimensions();

  if (!dimensions) {
    return;
  }

  await vectorStore.createHnswIndex({
    dimensions,
    namespace: process.env.PGVECTOR_TABLE_NAME || DEFAULT_TABLE_NAME,
  });

  hnswIndexEnsured = true;
};

export const getVectorStore = async () => {
  if (!vectorStorePromise) {
    vectorStorePromise = PGVectorStore.initialize(
      new OpenAIEmbeddings({
        openAIApiKey: getOpenAIApiKey(),
        model: getEmbeddingModelName(),
      }),
      {
        ...getVectorStoreConfig(),
        dimensions: getEmbeddingDimensions(),
      },
    )
      .then(async (vectorStore) => {
        await ensureHnswIndex(vectorStore);
        return vectorStore;
      })
      .catch((error) => {
        vectorStorePromise = undefined;
        hnswIndexEnsured = false;
        throw error;
      });
  }

  return vectorStorePromise;
};

export const isCourseIndexCurrent = async (course) => {
  if (!course.documents?.length) {
    return false;
  }

  const vectorStore = await getVectorStore();
  const query = `
    SELECT COUNT(DISTINCT "${vectorStore.metadataColumnName}"->>'documentId')::int AS document_count
    FROM ${vectorStore.computedTableName}
    WHERE "${vectorStore.metadataColumnName}"->>'courseId' = $1
      AND "${vectorStore.metadataColumnName}"->>'contentVersion' = $2
  `;
  const result = await vectorStore.pool.query(query, [
    course.id,
    String(course.contentVersion || 0),
  ]);

  return Number(result.rows[0]?.document_count || 0) === course.documents.length;
};

export const replaceCourseVectors = async (course, documents) => {
  const vectorStore = await getVectorStore();
  await vectorStore.delete({
    filter: { courseId: course.id },
  });

  if (documents.length > 0) {
    await vectorStore.addDocuments(documents);
  }
};

export const deleteCourseVectors = async (courseId) => {
  const vectorStore = await getVectorStore();
  await vectorStore.delete({
    filter: { courseId },
  });
};

export const searchCourseVectors = async (courseId, query, limit) => {
  const vectorStore = await getVectorStore();
  return vectorStore.similaritySearch(query, limit, {
    courseId,
  });
};
