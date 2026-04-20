import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Layout,
  List,
  Spin,
  Statistic,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import "./App.css";
import CourseSidebar from "./components/CourseSidebar";
import ConversationFeed from "./components/ConversationFeed";
import {
  askCourseQuestion,
  buildKnowledgeMap,
  buildReviewPack,
  createCourse,
  deleteCourseDocument,
  fetchCourses,
  runStudyAgent,
  uploadCourseDocument,
} from "./api";

const { Content, Sider } = Layout;
const { Paragraph, Text, Title } = Typography;

const createMessageId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const formatBytes = (bytes = 0) => {
  if (!bytes) {
    return "0 KB";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getHistoryPayload = (conversation = []) =>
  conversation
    .slice(-6)
    .map((item) =>
      item.role === "assistant"
        ? { role: "assistant", content: item.answer || "" }
        : { role: "user", content: item.content || "" },
    );

const App = () => {
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [loading, setLoading] = useState({
    boot: true,
    creatingCourse: false,
    uploadingDocument: false,
    chat: false,
    knowledge: false,
    review: false,
    agent: false,
  });
  const [chatInput, setChatInput] = useState("");
  const [knowledgeFocus, setKnowledgeFocus] = useState("");
  const [reviewFocus, setReviewFocus] = useState("");
  const [agentTask, setAgentTask] = useState("");
  const [conversations, setConversations] = useState({});
  const [knowledgeMaps, setKnowledgeMaps] = useState({});
  const [reviewPacks, setReviewPacks] = useState({});
  const [agentRuns, setAgentRuns] = useState({});

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) || null,
    [courses, selectedCourseId],
  );

  const conversation = selectedCourseId ? conversations[selectedCourseId] || [] : [];
  const knowledgeMap = selectedCourseId ? knowledgeMaps[selectedCourseId] : null;
  const reviewPack = selectedCourseId ? reviewPacks[selectedCourseId] : null;
  const agentRun = selectedCourseId ? agentRuns[selectedCourseId] : null;

  const syncCourse = (course) => {
    setCourses((currentCourses) => [
      course,
      ...currentCourses.filter((item) => item.id !== course.id),
    ]);
  };

  const loadCourses = async () => {
    setLoading((current) => ({ ...current, boot: true }));

    try {
      const nextCourses = await fetchCourses();
      setCourses(nextCourses);
      setSelectedCourseId((currentId) => {
        if (currentId && nextCourses.some((course) => course.id === currentId)) {
          return currentId;
        }

        return nextCourses[0]?.id || null;
      });
    } catch (error) {
      message.error(
        error.response?.data?.message || error.message || "Failed to load courses.",
      );
    } finally {
      setLoading((current) => ({ ...current, boot: false }));
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  const handleCreateCourse = async (draftCourse) => {
    if (!draftCourse.title?.trim()) {
      message.warning("Please enter a course title first.");
      return false;
    }

    setLoading((current) => ({ ...current, creatingCourse: true }));

    try {
      const course = await createCourse(draftCourse);
      syncCourse(course);
      setSelectedCourseId(course.id);
      message.success("Course workspace created.");
      return true;
    } catch (error) {
      message.error(
        error.response?.data?.message || error.message || "Failed to create course.",
      );
      return false;
    } finally {
      setLoading((current) => ({ ...current, creatingCourse: false }));
    }
  };

  const handleUploadDocument = async (file) => {
    if (!selectedCourseId) {
      message.warning("Create or select a course before uploading.");
      return;
    }

    setLoading((current) => ({ ...current, uploadingDocument: true }));

    try {
      const response = await uploadCourseDocument(selectedCourseId, file);
      syncCourse(response.course);
      message.success(`${file.name} uploaded and indexed.`);
    } catch (error) {
      message.error(
        error.response?.data?.message || error.message || "Upload failed.",
      );
      throw error;
    } finally {
      setLoading((current) => ({ ...current, uploadingDocument: false }));
    }
  };

  const handleRemoveDocument = async (documentId) => {
    if (!selectedCourseId) {
      return;
    }

    setLoading((current) => ({ ...current, uploadingDocument: true }));

    try {
      const response = await deleteCourseDocument(selectedCourseId, documentId);
      syncCourse(response.course);
      message.success("Material removed.");
    } catch (error) {
      message.error(
        error.response?.data?.message || error.message || "Failed to remove file.",
      );
    } finally {
      setLoading((current) => ({ ...current, uploadingDocument: false }));
    }
  };

  const appendConversation = (courseId, nextEntry) => {
    setConversations((currentConversations) => ({
      ...currentConversations,
      [courseId]: [...(currentConversations[courseId] || []), nextEntry],
    }));
  };

  const askQuestion = async (questionText) => {
    if (!selectedCourseId || !selectedCourse?.documentCount) {
      message.warning("Upload at least one PDF before asking questions.");
      return;
    }

    const question = questionText.trim();

    if (!question) {
      message.warning("Please type a question first.");
      return;
    }

    const currentConversation = conversation;
    appendConversation(selectedCourseId, {
      id: createMessageId(),
      role: "user",
      content: question,
    });
    setChatInput("");
    setLoading((current) => ({ ...current, chat: true }));

    try {
      const response = await askCourseQuestion(selectedCourseId, {
        question,
        history: getHistoryPayload(currentConversation),
      });

      appendConversation(selectedCourseId, {
        id: createMessageId(),
        role: "assistant",
        answer: response.answer,
        citations: response.citations || [],
        knowledgePoints: response.knowledgePoints || [],
        suggestedFollowUps: response.suggestedFollowUps || [],
      });
    } catch (error) {
      appendConversation(selectedCourseId, {
        id: createMessageId(),
        role: "assistant",
        answer:
          error.response?.data?.message ||
          error.message ||
          "I could not answer that right now.",
        citations: [],
        knowledgePoints: [],
        suggestedFollowUps: [],
      });
    } finally {
      setLoading((current) => ({ ...current, chat: false }));
    }
  };

  const handleGenerateKnowledgeMap = async () => {
    if (!selectedCourseId || !selectedCourse?.documentCount) {
      message.warning("Upload at least one PDF before generating a knowledge map.");
      return;
    }

    setLoading((current) => ({ ...current, knowledge: true }));

    try {
      const response = await buildKnowledgeMap(selectedCourseId, {
        focus: knowledgeFocus.trim(),
      });
      setKnowledgeMaps((current) => ({
        ...current,
        [selectedCourseId]: response,
      }));
    } catch (error) {
      message.error(
        error.response?.data?.message ||
          error.message ||
          "Failed to build the knowledge map.",
      );
    } finally {
      setLoading((current) => ({ ...current, knowledge: false }));
    }
  };

  const handleGenerateReviewPack = async () => {
    if (!selectedCourseId || !selectedCourse?.documentCount) {
      message.warning("Upload at least one PDF before generating a review pack.");
      return;
    }

    setLoading((current) => ({ ...current, review: true }));

    try {
      const response = await buildReviewPack(selectedCourseId, {
        focus: reviewFocus.trim(),
      });
      setReviewPacks((current) => ({
        ...current,
        [selectedCourseId]: response,
      }));
    } catch (error) {
      message.error(
        error.response?.data?.message ||
          error.message ||
          "Failed to build the review pack.",
      );
    } finally {
      setLoading((current) => ({ ...current, review: false }));
    }
  };

  const handleRunAgent = async () => {
    if (!selectedCourseId || !selectedCourse?.documentCount) {
      message.warning("Upload at least one PDF before running the study agent.");
      return;
    }

    const task = agentTask.trim();

    if (!task) {
      message.warning("Describe the task you want the study agent to complete.");
      return;
    }

    setLoading((current) => ({ ...current, agent: true }));

    try {
      const response = await runStudyAgent(selectedCourseId, {
        task,
        history: getHistoryPayload(conversation),
      });
      setAgentRuns((current) => ({
        ...current,
        [selectedCourseId]: response,
      }));
    } catch (error) {
      message.error(
        error.response?.data?.message ||
          error.message ||
          "Study agent failed to finish the task.",
      );
    } finally {
      setLoading((current) => ({ ...current, agent: false }));
    }
  };

  const renderCitationStrip = (citations = []) => {
    if (!citations.length) {
      return null;
    }

    return (
      <div className="citation-strip">
        {citations.map((citation) => (
          <div
            key={`${citation.documentId}-${citation.pageNumber}-${citation.excerpt}`}
            className="citation-chip"
          >
            <Text strong>
              {citation.documentTitle} · p.{citation.pageNumber || "?"}
            </Text>
            <Paragraph type="secondary">{citation.excerpt}</Paragraph>
          </div>
        ))}
      </div>
    );
  };

  const renderKnowledgeMap = (data) => {
    if (!data) {
      return (
        <div className="empty-panel">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="生成一份课程知识图谱，把 scattered slides 重新整理成结构化知识点。"
          />
        </div>
      );
    }

    return (
      <div className="result-stack">
        <Card className="workspace-card" bordered={false}>
          <Text className="section-label">课程总览</Text>
          <Title level={4}>{data.focus || "Overall Knowledge Map"}</Title>
          <Paragraph>{data.overview}</Paragraph>
        </Card>

        <div className="grid-two">
          {data.modules?.map((module) => (
            <Card
              key={`${module.title}-${module.summary}`}
              className="workspace-card"
              bordered={false}
            >
              <Title level={5}>{module.title}</Title>
              <Paragraph>{module.summary}</Paragraph>
              <List
                size="small"
                dataSource={module.knowledgePoints}
                renderItem={(item) => <List.Item>{item}</List.Item>}
              />
            </Card>
          ))}
        </div>

        <Card className="workspace-card" bordered={false}>
          <Text className="section-label">核心术语</Text>
          <div className="term-grid">
            {data.keyTerms?.map((term) => (
              <div key={term.term} className="term-card">
                <Text strong>{term.term}</Text>
                <Paragraph type="secondary">{term.explanation}</Paragraph>
              </div>
            ))}
          </div>
          {data.studyTips?.length ? (
            <>
              <Text className="section-label">学习建议</Text>
              <List
                size="small"
                dataSource={data.studyTips}
                renderItem={(item) => <List.Item>{item}</List.Item>}
              />
            </>
          ) : null}
        </Card>

        <Card className="workspace-card" bordered={false}>
          <Text className="section-label">引用材料</Text>
          {renderCitationStrip(data.citations)}
        </Card>
      </div>
    );
  };

  const renderReviewPack = (data) => {
    if (!data) {
      return (
        <div className="empty-panel">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="给出复习范围后，这里会生成提纲、必背点和练习题。"
          />
        </div>
      );
    }

    return (
      <div className="result-stack">
        <Card className="workspace-card" bordered={false}>
          <Text className="section-label">复习主题</Text>
          <Title level={4}>{data.focus}</Title>
          <div className="outline-list">
            {data.outline?.map((section) => (
              <div key={section.title} className="outline-block">
                <Text strong>{section.title}</Text>
                <List
                  size="small"
                  dataSource={section.items}
                  renderItem={(item) => <List.Item>{item}</List.Item>}
                />
              </div>
            ))}
          </div>
        </Card>

        <div className="grid-two">
          <Card className="workspace-card" bordered={false}>
            <Text className="section-label">先背这些</Text>
            <List
              size="small"
              dataSource={data.memorizeFirst}
              renderItem={(item) => <List.Item>{item}</List.Item>}
            />
          </Card>

          <Card className="workspace-card" bordered={false}>
            <Text className="section-label">复习 checklist</Text>
            <List
              size="small"
              dataSource={data.checklist}
              renderItem={(item) => <List.Item>{item}</List.Item>}
            />
          </Card>
        </div>

        <Card className="workspace-card" bordered={false}>
          <Text className="section-label">自动出题</Text>
          <div className="quiz-stack">
            {data.quiz?.map((item, index) => (
              <div key={`${item.question}-${index}`} className="quiz-card">
                <Tag color="purple">{item.type}</Tag>
                <Text strong>{item.question}</Text>
                <Text strong>参考答案</Text>
                <Paragraph>{item.answer}</Paragraph>
                {item.explanation ? (
                  <>
                    <Text strong>解释</Text>
                    <Paragraph type="secondary">{item.explanation}</Paragraph>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        </Card>

        <Card className="workspace-card" bordered={false}>
          <Text className="section-label">引用材料</Text>
          {renderCitationStrip(data.citations)}
        </Card>
      </div>
    );
  };

  const renderAgentRun = (data) => {
    if (!data) {
      return (
        <div className="empty-panel">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="让轻量 Agent 决定该先检索、梳理知识点，还是直接出一套复习题。"
          />
        </div>
      );
    }

    return (
      <div className="result-stack">
        <Alert
          type="success"
          showIcon
          className="agent-summary"
          message="Agent Summary"
          description={data.answer}
        />

        <Card className="workspace-card" bordered={false}>
          <Text className="section-label">执行步骤</Text>
          <List
            dataSource={data.toolCalls || []}
            renderItem={(call, index) => (
              <List.Item>
                <List.Item.Meta
                  title={`Step ${index + 1}: ${call.tool}`}
                  description={
                    <>
                      <Paragraph style={{ marginBottom: 8 }}>{call.input}</Paragraph>
                      {call.outputPreview ? (
                        <Text type="secondary">{call.outputPreview}</Text>
                      ) : null}
                    </>
                  }
                />
              </List.Item>
            )}
          />
        </Card>

        {data.artifacts?.qa ? (
          <Card className="workspace-card" bordered={false}>
            <Text className="section-label">Agent Answer</Text>
            <Paragraph>{data.artifacts.qa.answer}</Paragraph>
            {renderCitationStrip(data.artifacts.qa.citations)}
          </Card>
        ) : null}

        {data.artifacts?.knowledgeMap ? renderKnowledgeMap(data.artifacts.knowledgeMap) : null}
        {data.artifacts?.reviewPack ? renderReviewPack(data.artifacts.reviewPack) : null}
      </div>
    );
  };

  const renderWorkspace = () => {
    if (loading.boot) {
      return (
        <div className="loading-page">
          <Spin size="large" />
          <Paragraph type="secondary">Loading course workspaces…</Paragraph>
        </div>
      );
    }

    if (!selectedCourse) {
      return (
        <div className="empty-page">
          <Title level={2}>把项目换成“课程学习助手”</Title>
          <Paragraph>
            先在左边创建一门课，再上传多份讲义。之后你就能基于同一门课的所有资料做引用式问答、知识点梳理、复习提纲、自动出题和轻量 Agent 调度。
          </Paragraph>
        </div>
      );
    }

    return (
      <>
        <div className="hero-card">
          <div>
            <Text className="eyebrow">Multi-document course workspace</Text>
            <Title level={2}>{selectedCourse.title}</Title>
            <Paragraph>
              {selectedCourse.description ||
                "Use this workspace to ask cited questions, distill key concepts, and prepare exam review packs."}
            </Paragraph>
          </div>
          <div className="hero-stats">
            <Statistic
              title="Materials"
              value={selectedCourse.documentCount || 0}
            />
            <Statistic title="Size" value={formatBytes(selectedCourse.totalBytes)} />
          </div>
        </div>

        <Tabs
          className="workspace-tabs"
          items={[
            {
              key: "ask",
              label: "Ask & Cite",
              children: (
                <div className="tab-stack">
                  <Card className="workspace-card" bordered={false}>
                    <ConversationFeed
                      conversation={conversation}
                      loading={loading.chat}
                      onSuggestionClick={askQuestion}
                    />
                  </Card>
                  <Card className="workspace-card composer-card" bordered={false}>
                    <Text className="section-label">提一个和课程内容有关的问题</Text>
                    <Input.TextArea
                      rows={3}
                      value={chatInput}
                      placeholder="例如：这门课里 dynamic programming 的状态设计思路是什么？"
                      onChange={(event) => setChatInput(event.target.value)}
                      onPressEnter={(event) => {
                        if (!event.shiftKey) {
                          event.preventDefault();
                          askQuestion(chatInput);
                        }
                      }}
                    />
                    <div className="composer-actions">
                      <Button
                        type="primary"
                        loading={loading.chat}
                        onClick={() => askQuestion(chatInput)}
                      >
                        Ask with citations
                      </Button>
                    </div>
                  </Card>
                </div>
              ),
            },
            {
              key: "knowledge",
              label: "Knowledge Map",
              children: (
                <div className="tab-stack">
                  <Card className="workspace-card composer-card" bordered={false}>
                    <Text className="section-label">梳理某个章节，或者直接做全课知识图谱</Text>
                    <Input
                      value={knowledgeFocus}
                      placeholder="例如：Lecture 4 Graph Traversal"
                      onChange={(event) => setKnowledgeFocus(event.target.value)}
                    />
                    <div className="composer-actions">
                      <Button
                        type="primary"
                        loading={loading.knowledge}
                        onClick={handleGenerateKnowledgeMap}
                      >
                        Generate knowledge map
                      </Button>
                    </div>
                  </Card>
                  {loading.knowledge ? (
                    <div className="loading-page compact">
                      <Spin />
                      <Paragraph type="secondary">
                        Distilling the course into study-friendly concepts…
                      </Paragraph>
                    </div>
                  ) : (
                    renderKnowledgeMap(knowledgeMap)
                  )}
                </div>
              ),
            },
            {
              key: "review",
              label: "Review Kit",
              children: (
                <div className="tab-stack">
                  <Card className="workspace-card composer-card" bordered={false}>
                    <Text className="section-label">指定复习范围，生成考前提纲和题目</Text>
                    <Input
                      value={reviewFocus}
                      placeholder="例如：Midterm topics or Lecture 1-5"
                      onChange={(event) => setReviewFocus(event.target.value)}
                    />
                    <div className="composer-actions">
                      <Button
                        type="primary"
                        loading={loading.review}
                        onClick={handleGenerateReviewPack}
                      >
                        Build review pack
                      </Button>
                    </div>
                  </Card>
                  {loading.review ? (
                    <div className="loading-page compact">
                      <Spin />
                      <Paragraph type="secondary">
                        Building a revision outline and quiz set…
                      </Paragraph>
                    </div>
                  ) : (
                    renderReviewPack(reviewPack)
                  )}
                </div>
              ),
            },
            {
              key: "agent",
              label: "Study Agent",
              children: (
                <div className="tab-stack">
                  <Card className="workspace-card composer-card" bordered={false}>
                    <Text className="section-label">把任务交给轻量 Agent</Text>
                    <Input.TextArea
                      rows={3}
                      value={agentTask}
                      placeholder="例如：先帮我梳理 recursion 这一章的知识点，再出 4 道适合面试和考试的题。"
                      onChange={(event) => setAgentTask(event.target.value)}
                    />
                    <div className="composer-actions">
                      <Button
                        type="primary"
                        loading={loading.agent}
                        onClick={handleRunAgent}
                      >
                        Run study agent
                      </Button>
                    </div>
                  </Card>
                  {loading.agent ? (
                    <div className="loading-page compact">
                      <Spin />
                      <Paragraph type="secondary">
                        Planning tool calls and preparing the study package…
                      </Paragraph>
                    </div>
                  ) : (
                    renderAgentRun(agentRun)
                  )}
                </div>
              ),
            },
          ]}
        />
      </>
    );
  };

  return (
    <Layout className="app-shell">
      <Sider width={360} className="app-sidebar">
        <CourseSidebar
          courses={courses}
          selectedCourseId={selectedCourseId}
          selectedCourse={selectedCourse}
          creatingCourse={loading.creatingCourse}
          uploadingDocument={loading.uploadingDocument}
          onSelectCourse={setSelectedCourseId}
          onCreateCourse={handleCreateCourse}
          onUploadDocument={handleUploadDocument}
          onRemoveDocument={handleRemoveDocument}
        />
      </Sider>
      <Layout className="app-main">
        <Content className="app-content">{renderWorkspace()}</Content>
      </Layout>
    </Layout>
  );
};

export default App;
