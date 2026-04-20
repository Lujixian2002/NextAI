import React, { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Empty,
  Input,
  List,
  Popconfirm,
  Space,
  Tag,
  Typography,
  Upload,
} from "antd";
import { DeleteOutlined, InboxOutlined, PlusOutlined } from "@ant-design/icons";

const { Dragger } = Upload;
const { Paragraph, Text, Title } = Typography;

const CourseSidebar = ({
  courses,
  selectedCourseId,
  selectedCourse,
  creatingCourse,
  uploadingDocument,
  onSelectCourse,
  onCreateCourse,
  onUploadDocument,
  onRemoveDocument,
}) => {
  const [draftCourse, setDraftCourse] = useState({
    title: "",
    code: "",
    description: "",
  });

  const uploadProps = useMemo(
    () => ({
      accept: ".pdf",
      multiple: true,
      showUploadList: false,
      disabled: !selectedCourseId || uploadingDocument,
      customRequest: async ({ file, onSuccess, onError }) => {
        try {
          if (!selectedCourseId) {
            throw new Error("Create or select a course before uploading PDFs.");
          }

          await onUploadDocument(file);
          onSuccess?.("ok");
        } catch (error) {
          onError?.(error);
        }
      },
    }),
    [onUploadDocument, selectedCourseId, uploadingDocument],
  );

  const handleCreateCourse = async () => {
    const created = await onCreateCourse(draftCourse);

    if (created) {
      setDraftCourse({
        title: "",
        code: "",
        description: "",
      });
    }
  };

  return (
    <div className="sidebar-shell">
      <div className="sidebar-brand">
        <Text className="eyebrow">Course RAG Studio</Text>
        <Title level={3}>课件学习助手</Title>
        <Paragraph>
          用一门课的多份讲义、作业说明和阅读材料，搭一个真正能复习的
          RAG 工作台。
        </Paragraph>
      </div>

      <Card className="sidebar-card" bordered={false}>
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <div>
            <Text strong>新建课程空间</Text>
            <Paragraph type="secondary">
              先建一门课，再把 lecture、notes、assignment 一起放进来。
            </Paragraph>
          </div>
          <Input
            placeholder="Course title"
            value={draftCourse.title}
            onChange={(event) =>
              setDraftCourse((current) => ({
                ...current,
                title: event.target.value,
              }))
            }
          />
          <Input
            placeholder="Course code"
            value={draftCourse.code}
            onChange={(event) =>
              setDraftCourse((current) => ({
                ...current,
                code: event.target.value,
              }))
            }
          />
          <Input.TextArea
            rows={3}
            placeholder="Short description"
            value={draftCourse.description}
            onChange={(event) =>
              setDraftCourse((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            loading={creatingCourse}
            onClick={handleCreateCourse}
            block
          >
            Create course
          </Button>
        </Space>
      </Card>

      <Card className="sidebar-card" bordered={false}>
        <div className="section-head">
          <Text strong>课程列表</Text>
          <Badge count={courses.length} color="#29594a" />
        </div>
        {courses.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="还没有课程，先创建一个学习空间。"
          />
        ) : (
          <List
            className="course-list"
            dataSource={courses}
            renderItem={(course) => {
              const active = course.id === selectedCourseId;

              return (
                <List.Item
                  className={`course-list-item ${active ? "active" : ""}`}
                  onClick={() => onSelectCourse(course.id)}
                >
                  <div>
                    <Text strong>{course.title}</Text>
                    <div className="course-meta-row">
                      {course.code ? <Tag>{course.code}</Tag> : null}
                      <Tag color="gold">
                        {course.documentCount || 0} files
                      </Tag>
                    </div>
                    {course.description ? (
                      <Paragraph
                        ellipsis={{ rows: 2 }}
                        type="secondary"
                        style={{ marginBottom: 0 }}
                      >
                        {course.description}
                      </Paragraph>
                    ) : null}
                  </div>
                </List.Item>
              );
            }}
          />
        )}
      </Card>

      <Card className="sidebar-card materials-card" bordered={false}>
        <div className="section-head">
          <Text strong>课程资料</Text>
          {selectedCourse ? (
            <Tag color="green">{selectedCourse.documents?.length || 0} docs</Tag>
          ) : null}
        </div>

        <Dragger {...uploadProps} className="course-uploader">
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">
            {selectedCourse
              ? "拖拽 PDF 课件到这里，或点击上传"
              : "先选择一门课程再上传 PDF"}
          </p>
          <p className="ant-upload-hint">
            Lecture slides、reading notes、assignment instructions 都可以放在同一个课程空间。
          </p>
        </Dragger>

        {selectedCourse?.documents?.length ? (
          <List
            className="document-list"
            dataSource={selectedCourse.documents}
            renderItem={(document) => (
              <List.Item
                actions={[
                  <Popconfirm
                    key="delete"
                    title="Remove this material?"
                    description="This will delete the PDF and rebuild the course index."
                    onConfirm={() => onRemoveDocument(document.id)}
                    okText="Remove"
                    cancelText="Cancel"
                  >
                    <Button
                      danger
                      type="text"
                      icon={<DeleteOutlined />}
                      size="small"
                    />
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  title={<Text>{document.name}</Text>}
                  description={
                    <Space size={8} wrap>
                      <Tag>{Math.max(1, Math.round((document.size || 0) / 1024))} KB</Tag>
                      <Tag color="blue">
                        {new Date(document.uploadedAt).toLocaleDateString()}
                      </Tag>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        ) : (
          <Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
            这一门课还没有资料，上传至少一份 PDF 之后就可以开始问答和复习。
          </Paragraph>
        )}
      </Card>
    </div>
  );
};

export default CourseSidebar;
