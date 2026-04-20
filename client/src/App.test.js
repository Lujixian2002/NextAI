import { act } from "react";
import { render, screen } from "@testing-library/react";
jest.mock("./api", () => ({
  fetchCourses: jest.fn(),
  createCourse: jest.fn(),
  uploadCourseDocument: jest.fn(),
  deleteCourseDocument: jest.fn(),
  askCourseQuestion: jest.fn(),
  buildKnowledgeMap: jest.fn(),
  buildReviewPack: jest.fn(),
  runStudyAgent: jest.fn(),
}));

test("renders the course workspace shell", async () => {
  const api = require("./api");
  const App = require("./App").default;

  api.fetchCourses.mockResolvedValue([]);
  api.createCourse.mockResolvedValue({});
  api.uploadCourseDocument.mockResolvedValue({});
  api.deleteCourseDocument.mockResolvedValue({});
  api.askCourseQuestion.mockResolvedValue({});
  api.buildKnowledgeMap.mockResolvedValue({});
  api.buildReviewPack.mockResolvedValue({});
  api.runStudyAgent.mockResolvedValue({});

  await act(async () => {
    render(<App />);
  });

  expect(await screen.findByText(/course rag studio/i)).toBeInTheDocument();
  expect(screen.getByText(/create course/i)).toBeInTheDocument();
});
