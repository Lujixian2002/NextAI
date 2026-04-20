import axios from "axios";

const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || "http://localhost:5001",
});

export const fetchCourses = async () => {
  const response = await api.get("/courses");
  return response.data;
};

export const createCourse = async (payload) => {
  const response = await api.post("/courses", payload);
  return response.data;
};

export const uploadCourseDocument = async (courseId, file) => {
  const formData = new FormData();
  formData.append("files", file);

  const response = await api.post(`/courses/${courseId}/documents`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
};

export const deleteCourseDocument = async (courseId, documentId) => {
  const response = await api.delete(
    `/courses/${courseId}/documents/${documentId}`,
  );
  return response.data;
};

export const askCourseQuestion = async (courseId, payload) => {
  const response = await api.post(`/courses/${courseId}/chat`, payload);
  return response.data;
};

export const buildKnowledgeMap = async (courseId, payload) => {
  const response = await api.post(`/courses/${courseId}/knowledge-map`, payload);
  return response.data;
};

export const buildReviewPack = async (courseId, payload) => {
  const response = await api.post(`/courses/${courseId}/review-pack`, payload);
  return response.data;
};

export const runStudyAgent = async (courseId, payload) => {
  const response = await api.post(`/courses/${courseId}/agent`, payload);
  return response.data;
};
