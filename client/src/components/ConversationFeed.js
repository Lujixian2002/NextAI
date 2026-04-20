import React, { useEffect, useRef } from "react";
import { Button, Empty, Space, Spin, Tag, Typography } from "antd";

const { Paragraph, Text } = Typography;

const ConversationFeed = ({
  conversation,
  loading,
  onSuggestionClick,
}) => {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [conversation, loading]);

  if (!conversation.length && !loading) {
    return (
      <div className="empty-panel">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="上传课程资料后，从任何一个知识点开始提问。"
        />
      </div>
    );
  }

  return (
    <div className="conversation-feed">
      {conversation.map((item) => {
        if (item.role === "user") {
          return (
            <div key={item.id} className="message-row user-row">
              <div className="message-bubble user-bubble">{item.content}</div>
            </div>
          );
        }

        return (
          <div key={item.id} className="message-row assistant-row">
            <div className="message-bubble assistant-bubble">
              <Paragraph className="assistant-answer">{item.answer}</Paragraph>

              {item.knowledgePoints?.length ? (
                <div className="message-section">
                  <Text strong>知识点</Text>
                  <Space wrap style={{ marginTop: 8 }}>
                    {item.knowledgePoints.map((point) => (
                      <Tag key={point} color="geekblue">
                        {point}
                      </Tag>
                    ))}
                  </Space>
                </div>
              ) : null}

              {item.citations?.length ? (
                <div className="message-section">
                  <Text strong>引用来源</Text>
                  <div className="citation-grid">
                    {item.citations.map((citation) => (
                      <div
                        key={`${citation.documentId}-${citation.pageNumber}`}
                        className="citation-card"
                      >
                        <Text strong>
                          {citation.documentTitle} · p.{citation.pageNumber || "?"}
                        </Text>
                        <Paragraph type="secondary">{citation.excerpt}</Paragraph>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {item.suggestedFollowUps?.length ? (
                <div className="message-section">
                  <Text strong>继续追问</Text>
                  <Space wrap style={{ marginTop: 8 }}>
                    {item.suggestedFollowUps.map((prompt) => (
                      <Button
                        key={prompt}
                        size="small"
                        onClick={() => onSuggestionClick(prompt)}
                      >
                        {prompt}
                      </Button>
                    ))}
                  </Space>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}

      {loading ? (
        <div className="loading-state">
          <Spin />
          <Text type="secondary">正在检索材料并组织答案…</Text>
        </div>
      ) : null}

      <div ref={bottomRef} />
    </div>
  );
};

export default ConversationFeed;
