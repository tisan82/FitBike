"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { OperationsAdmin } from "@/features/admin/components/OperationsAdmin";
import { ADMIN_RESOURCES } from "@/features/admin/config/admin-resources";
import { deactivateResource, listResource, saveResource, signOutAdmin, verifyAdminSession } from "@/features/admin/services/admin.service";
import type { AdminRow } from "@/features/admin/types/admin.types";

export function AdminConsole() {
  const router = useRouter();
  const [section, setSection] = useState<"operations" | "data">("operations");
  const [resourceIndex, setResourceIndex] = useState(0);
  const config = ADMIN_RESOURCES[resourceIndex];
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminRow | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const visibleColumns = useMemo(() => config.fields.slice(0, 6), [config]);

  async function load() {
    setLoading(true); setMessage(null);
    try { setRows(await listResource(config, search)); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "조회에 실패했습니다."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    verifyAdminSession().then((session) => {
      if (!session) router.replace("/admin/login");
      else setAuthReady(true);
    }).catch(() => router.replace("/admin/login"));
  }, [router]);

  useEffect(() => {
    if (authReady && section === "data") void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, resourceIndex, section]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values: AdminRow = editing ? { ...editing } : {};
    for (const field of config.fields) {
      if (field.readonly) continue;
      const raw = form.get(field.key);
      if (field.type === "select" && raw !== "" && !field.options?.some((option) => option.value === raw)) {
        setMessage(`${field.label}: 허용되지 않은 값입니다.`); return;
      }
      values[field.key] = field.type === "boolean" ? raw === "on" : field.type === "number" ? (raw === "" ? null : Number(raw)) : (raw === "" ? null : String(raw));
    }
    try { await saveResource(config, values); setEditing(null); setMessage("저장했습니다."); await load(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "저장에 실패했습니다."); }
  }

  if (!authReady) return <main className="mx-auto max-w-7xl px-5 py-10"><p className="rounded-2xl border border-border p-6 text-foreground-secondary" role="status">관리자 인증을 확인하는 중입니다.</p></main>;

  return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-5 sm:py-10">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-semibold text-primary">FitBike</p><h1 className="mt-1 text-3xl font-bold">Admin</h1></div><button className="min-h-11 rounded-xl border border-border px-4 font-semibold" onClick={async () => { await signOutAdmin(); router.replace("/admin/login"); }}>로그아웃</button></div>
    <nav className="mt-8 flex gap-2 overflow-x-auto pb-2" aria-label="관리자 메뉴">
      <button type="button" onClick={() => { setSection("operations"); setEditing(null); }} className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-bold ${section === "operations" ? "bg-primary text-primary-foreground" : "border border-border"}`}>운영 어드민</button>
      {ADMIN_RESOURCES.map((item, index) => <button key={item.key} type="button" onClick={() => { setSection("data"); setResourceIndex(index); setEditing(null); }} className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${section === "data" && index === resourceIndex ? "bg-primary text-primary-foreground" : "border border-border"}`}>{item.label}</button>)}
    </nav>
    {section === "operations" ? <OperationsAdmin /> : <section className="mt-8" aria-labelledby="data-admin-title">
      <div><p className="text-sm font-semibold text-primary">기준 데이터</p><h2 id="data-admin-title" className="mt-1 text-2xl font-bold">{config.label} 관리</h2></div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row"><input className="min-h-12 min-w-0 flex-1 rounded-xl border border-border px-4" placeholder="검색" value={search} onChange={(event) => setSearch(event.target.value)} /><button className="min-h-12 rounded-xl border border-border px-4 font-semibold" onClick={load}>조회</button><button className="min-h-12 rounded-xl bg-primary px-4 font-bold text-primary-foreground" onClick={() => setEditing({})}>등록</button></div>
      {message ? <p className="mt-4 rounded-xl bg-surface-secondary p-3 text-sm" role="status">{message}</p> : null}
      <div className="mt-6 overflow-x-auto rounded-2xl border border-border"><table className="min-w-full text-sm"><thead className="bg-surface-secondary"><tr>{visibleColumns.map((field) => <th key={field.key} className="px-3 py-3 text-left">{field.label}</th>)}<th className="px-3 py-3">관리</th></tr></thead><tbody>{loading ? <tr><td className="p-6" colSpan={visibleColumns.length + 1}>불러오는 중...</td></tr> : rows.length === 0 ? <tr><td className="p-6" colSpan={visibleColumns.length + 1}>데이터가 없습니다.</td></tr> : rows.map((row) => <tr key={String(row[config.primaryKey])} className="border-t border-border">{visibleColumns.map((field) => <td key={field.key} className="max-w-56 truncate px-3 py-3">{String(row[field.key] ?? "-")}</td>)}<td className="whitespace-nowrap px-3 py-3"><button className="mr-3 font-semibold text-primary" onClick={() => setEditing(row)}>수정</button>{"is_active" in row ? <button className="font-semibold text-red-700" onClick={async () => { await deactivateResource(config, row); await load(); }}>비활성</button> : null}</td></tr>)}</tbody></table></div>
    </section>}
    {editing ? <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"><form onSubmit={save} className="mx-auto max-w-2xl space-y-4 rounded-2xl bg-surface p-6"><div className="flex justify-between"><h2 className="text-xl font-bold">{editing[config.primaryKey] ? "수정" : "등록"}</h2><button type="button" onClick={() => setEditing(null)}>닫기</button></div><div className="grid gap-4 sm:grid-cols-2">{config.fields.filter((field) => !field.readonly).map((field) => <label key={field.key} className="text-sm font-medium">{field.label}{field.type === "boolean" ? <input className="ml-3" name={field.key} type="checkbox" defaultChecked={Boolean(editing[field.key] ?? true)} /> : field.type === "textarea" ? <textarea className="mt-2 w-full rounded-lg border border-border px-3 py-2" name={field.key} defaultValue={String(editing[field.key] ?? "")} required={field.required} /> : field.type === "select" ? <select className="mt-2 w-full rounded-lg border border-border px-3 py-2" name={field.key} defaultValue={String(editing[field.key] ?? "")} required={field.required}><option value="">선택 안 함</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input className="mt-2 w-full rounded-lg border border-border px-3 py-2" name={field.key} type={field.type} defaultValue={String(editing[field.key] ?? "")} required={field.required} />}</label>)}</div><button className="w-full rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground">저장</button></form></div> : null}
  </main>;
}
