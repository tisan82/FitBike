"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { adminApi } from "@/features/admin/services/admin.service";
import type { OperationsOverview, OperationsTopic } from "@/features/admin/types/operations.types";

const statusLabel: Record<string, string> = {
  PLANNED: "대기", GENERATING: "제작 중", REVIEW_REQUIRED: "검토 필요", APPROVED: "승인", PUBLISHED: "게시 완료",
  BLOCKED: "보류", FAILED: "실패", CANDIDATE_FAILED: "후보 실패", DUPLICATE: "중복 제외", ARCHIVED: "보관",
};

const statusStyle: Record<string, string> = {
  PUBLISHED: "bg-emerald-50 text-emerald-700", APPROVED: "bg-blue-50 text-blue-700", BLOCKED: "bg-red-50 text-red-700",
  FAILED: "bg-red-50 text-red-700", CANDIDATE_FAILED: "bg-red-50 text-red-700", REVIEW_REQUIRED: "bg-amber-50 text-amber-800",
  GENERATING: "bg-violet-50 text-violet-700", DUPLICATE: "bg-surface-secondary text-foreground-secondary",
};

type Transition = { label: string; status: string; tone?: "primary" | "danger" };

function transitions(topic: OperationsTopic): Transition[] {
  if (topic.status === "PLANNED") return [{ label: "제작 시작", status: "GENERATING", tone: "primary" }, { label: "보류", status: "BLOCKED", tone: "danger" }];
  if (topic.status === "GENERATING") return [{ label: "검토 요청", status: "REVIEW_REQUIRED", tone: "primary" }, { label: "보류", status: "BLOCKED", tone: "danger" }];
  if (topic.status === "REVIEW_REQUIRED") return [{ label: "승인", status: "APPROVED", tone: "primary" }, { label: "보류", status: "BLOCKED", tone: "danger" }];
  if (["BLOCKED", "FAILED", "CANDIDATE_FAILED"].includes(topic.status) && topic.attemptCount < 2) return [{ label: "재시도", status: "GENERATING", tone: "primary" }, { label: "보관", status: "ARCHIVED" }];
  if (topic.status === "APPROVED") return [{ label: "승인 취소", status: "BLOCKED", tone: "danger" }];
  return [];
}

function FactoryFlow() {
  const stages = ["Research", "작성", "이미지", "QA", "게시", "Sitemap / RSS"];
  return <div className="mt-6 rounded-2xl border border-border bg-surface p-4 sm:p-5">
    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">{stages.map((stage, index) => <span key={stage} className="contents"><span className="rounded-full bg-surface-secondary px-3 py-2">{stage}</span>{index < stages.length - 1 ? <span aria-hidden="true" className="text-foreground-secondary">→</span> : null}</span>)}</div>
    <p className="mt-3 text-sm leading-6 text-foreground-secondary">게시 완료 콘텐츠는 동적 sitemap/RSS에 자동 반영됩니다. 후보 하나가 실패한 경우 실패 원인을 확인·재시도하고 다음 후보 운영을 계속할 수 있도록 후보 단위로 관리합니다.</p>
  </div>;
}

export function OperationsAdmin() {
  const [overview, setOverview] = useState<OperationsOverview | null>(null);
  const [filter, setFilter] = useState("ACTIVE");
  const [loading, setLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setOverview(await adminApi<OperationsOverview>("/api/internal/admin/operations")); setMessage(null); }
    catch (error) { setMessage(error instanceof Error ? error.message : "운영 현황을 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const topics = useMemo(() => {
    if (!overview) return [];
    if (filter === "ACTIVE") return overview.topics.filter((topic) => !["PUBLISHED", "ARCHIVED", "DUPLICATE"].includes(topic.status));
    if (filter === "FAILED") return overview.topics.filter((topic) => ["FAILED", "CANDIDATE_FAILED", "BLOCKED"].includes(topic.status));
    return overview.topics.filter((topic) => topic.status === filter);
  }, [filter, overview]);

  const nextTopic = useMemo(() => overview?.topics.filter((topic) => topic.status === "PLANNED").sort((a, b) => b.priority - a.priority)[0] ?? null, [overview]);

  async function transition(topic: OperationsTopic, status: string) {
    setPendingKey(topic.topicKey); setMessage(null);
    try {
      await adminApi(`/api/internal/admin/topics/${topic.topicKey}`, { method: "PATCH", body: JSON.stringify({ expectedStatus: topic.status, status, lastError: status === "BLOCKED" ? "운영자 보류" : null }) });
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "상태를 변경하지 못했습니다."); }
    finally { setPendingKey(null); }
  }

  if (loading && !overview) return <div className="mt-8 rounded-2xl border border-border p-6 text-foreground-secondary" role="status">운영 현황을 불러오는 중입니다.</div>;

  const summary = overview?.summary;
  const cards = summary ? [
    ["게시 콘텐츠", summary.publishedContents, "서비스에 노출 중"], ["제작 대기", summary.plannedTopics, "자동 선택 대상"],
    ["진행 중", summary.generatingTopics, "Factory 작업 중"], ["검토 필요", summary.reviewRequiredTopics, "운영자 확인 필요"],
    ["게시 승인", summary.approvedTopics, "게시 패키지 대기"], ["실패·보류", summary.blockedTopics, "원인 확인·재시도"],
    ["출처 검토", summary.pendingSourceReviews, "권리 확인 필요"],
  ] as const : [];

  return <section className="mt-8" aria-labelledby="operations-title">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-primary">서비스 운영</p><h2 id="operations-title" className="mt-1 text-2xl font-bold">운영 관제센터</h2><p className="mt-2 text-base text-foreground-secondary">콘텐츠 큐, Factory 실행, 실패·보류와 검색 반영 상태를 한곳에서 확인합니다.</p></div><button type="button" onClick={load} className="min-h-11 rounded-xl border border-border px-4 font-semibold">새로고침</button></div>
    {message ? <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{message}</p> : null}
    <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map(([label, value, description]) => <article key={label} className="rounded-2xl border border-border bg-surface p-4"><p className="text-sm font-semibold text-foreground-secondary">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p><p className="mt-2 text-sm text-foreground-secondary">{description}</p></article>)}</div>
    <div className="mt-6 grid gap-3 lg:grid-cols-3"><article className="rounded-2xl border border-border bg-surface p-4"><p className="text-sm font-semibold text-foreground-secondary">다음 제작 대상</p><p className="mt-2 font-bold">{nextTopic?.topic ?? "대기 Topic 없음"}</p>{nextTopic ? <p className="mt-1 break-all text-sm text-foreground-secondary">{nextTopic.topicKey}</p> : null}</article><article className="rounded-2xl border border-border bg-surface p-4"><p className="text-sm font-semibold text-foreground-secondary">Sitemap</p><a className="mt-2 block font-bold text-primary" href="/sitemap.xml" target="_blank" rel="noreferrer">/sitemap.xml 확인</a><p className="mt-1 text-sm text-foreground-secondary">Published 콘텐츠 자동 반영</p></article><article className="rounded-2xl border border-border bg-surface p-4"><p className="text-sm font-semibold text-foreground-secondary">RSS</p><a className="mt-2 block font-bold text-primary" href="/rss.xml" target="_blank" rel="noreferrer">/rss.xml 확인</a><p className="mt-1 text-sm text-foreground-secondary">최신 Published 콘텐츠 피드</p></article></div>
    <FactoryFlow />
    <div className="mt-8 flex gap-2 overflow-x-auto pb-2" aria-label="Topic 상태 필터">{[["ACTIVE","진행 대상"],["FAILED","실패·보류"],["REVIEW_REQUIRED","검토 필요"],["APPROVED","승인"],["PUBLISHED","게시 완료"],["DUPLICATE","중복 제외"]].map(([value,label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${filter === value ? "bg-primary text-primary-foreground" : "border border-border bg-surface"}`}>{label}</button>)}</div>
    <div className="mt-4 space-y-3">{topics.length === 0 ? <p className="rounded-2xl border border-border p-6 text-foreground-secondary">해당 상태의 Topic이 없습니다.</p> : topics.map((topic) => <article key={topic.topicKey} className="rounded-2xl border border-border bg-surface p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyle[topic.status] ?? "bg-surface-secondary text-foreground-secondary"}`}>{statusLabel[topic.status] ?? topic.status}</span><span className="rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-semibold">위험도 {topic.riskLevel}</span><span className="rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-semibold">우선순위 {topic.priority}</span></div><h3 className="mt-3 text-lg font-bold leading-7">{topic.topic}</h3><p className="mt-1 break-all text-sm text-foreground-secondary">{topic.topicKey}</p></div><p className="text-sm text-foreground-secondary">시도 {topic.attemptCount}/2</p></div>{topic.lastError ? <div className="mt-4 rounded-xl bg-red-50 p-3"><p className="text-xs font-bold text-red-700">최근 실패 원인</p><p className="mt-1 text-sm leading-6 text-red-700">{topic.lastError}</p></div> : null}<div className="mt-4 flex flex-wrap gap-2">{transitions(topic).map((action) => <button key={action.status} type="button" disabled={pendingKey === topic.topicKey} onClick={() => transition(topic, action.status)} className={`min-h-11 rounded-xl px-4 text-sm font-bold disabled:opacity-50 ${action.tone === "primary" ? "bg-primary text-primary-foreground" : action.tone === "danger" ? "border border-red-200 text-red-700" : "border border-border"}`}>{pendingKey === topic.topicKey ? "처리 중" : action.label}</button>)}</div></article>)}</div>
  </section>;
}
