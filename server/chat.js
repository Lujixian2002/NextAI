import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai";

import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";

import { RetrievalQAChain } from "langchain/chains";
import { PromptTemplate } from "@langchain/core/prompts";

// NOTE: change this default filePath to any of your default file name
const chat = async (filePath = "./uploads/hbs-lean-startup.pdf", query) => {
  const openAIApiKey =
    process.env.OPENAI_API_KEY || process.env.REACT_APP_OPENAI_API_KEY;
  if (!openAIApiKey) {
    throw new Error("Missing OPENAI_API_KEY in server/.env");
  }

  // step 1: 读取pdf文本
  const loader = new PDFLoader(filePath);

  const data = await loader.load();

  // step 2: 将文档分割成小块
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500, //  (in terms of number of characters)
    chunkOverlap: 0,
  });

  const splitDocs = await textSplitter.splitDocuments(data);

  // step 3:

  const embeddings = new OpenAIEmbeddings({
    openAIApiKey,
  });

  const vectorStore = await MemoryVectorStore.fromDocuments(
    splitDocs,
    embeddings,
  );

  // step 4: retrieval
  // 演示如何使用向量存储进行相似性搜索
  // const relevantDocs = await vectorStore.similaritySearch(
  // "What is task decomposition?"
  // );

  // step 5: qa w/ customzie the prompt
  const model = new ChatOpenAI({
    modelName: "gpt-3.5-turbo",
    openAIApiKey,
  });

  const template = `Use the following pieces of context to answer the question at the end.
If you don't know the answer, just say that you don't know, don't try to make up an answer.
Use three sentences maximum and keep the answer as concise as possible.

{context}
Question: {question}
Helpful Answer:`;

  const chain = RetrievalQAChain.fromLLM(model, vectorStore.asRetriever(), {
    prompt: PromptTemplate.fromTemplate(template),
    // returnSourceDocuments: true,
  });

  const response = await chain.call({
    query,
  });

  return response;
};

export default chat;
