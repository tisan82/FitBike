"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_RESOURCES } from "@/features/admin/config/admin-resources";
import { deactivateResource, getAdminSession, isAllowedAdmin, listResource, saveResource, signOutAdmin } from "@/features/admin/services/admin.service";
import type { AdminRow } from "@/features/admin/types/admin.types";

export function AdminConsole() {
  const router = useRouter();
  const [resourceIndex, setResourceIndex] = useState(0);
  const config = ADMIN_RESOURCES[resourceIndex];
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const visibleColumns = useMemo(() => config.fields.slice(0, 6), [config]);

  async function load() {
    setLoading(true); setMessage(null);
    try { setRows(await listResource(config, search)); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "조회에 실패했습니다."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    getAdminSession().then((session) => {
      if (!session || !isAllowedAdmin(session.user.email)) router.replace("/admin/login");
      else load();
    }).catch(() => router.replace("/admin/login"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceIndex]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values: AdminRow = editing ? { ...editing } : {};
    for (const field of config.fields) {
      if (field.readonly) continue;
      const raw = form.get(field.key);
      values[field.key] = field.type === "boolean" ? raw === "on" : field.type === "number" ? (raw === "" ? null : Number(raw)) : (raw === "" ? null : String(raw));
    }
    try { await saveResource(config, values); setEditing(null); setMessage("저장했습니다."); await load(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "저장에 실패했습니다."); }
  }

  return <main className="mx-auto max-w-7xl px-5 py-10">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm text-gray-500">FitBike</p><h1 className="text-3xl font-bold">Admin</h1></div><button className="rounded-lg border px-4 py-2" onClick={async()=>{await signOutAdmin(); router.replace("/admin/login");}}>로그아웃</button></div>
    <div className="mt-8 flex flex-wrap gap-2">{ADMIN_RESOURCES.map((item,index)=><button key={item.key} onClick={()=>{setResourceIndex(index);setEditing(null);}} className={`rounded-full px-4 py-2 text-sm ${index===resourceIndex?"bg-black text-white":"border"}`}>{item.label}</button>)}</div>
    <div className="mt-8 flex flex-wrap gap-3"><input className="min-w-64 flex-1 rounded-lg border px-3 py-2" placeholder="검색" value={search} onChange={(e)=>setSearch(e.target.value)} /><button className="rounded-lg border px-4 py-2" onClick={load}>조회</button><button className="rounded-lg bg-black px-4 py-2 text-white" onClick={()=>setEditing({})}>등록</button></div>
    {message ? <p className="mt-4 rounded-lg bg-gray-100 p-3 text-sm">{message}</p> : null}
    <div className="mt-6 overflow-x-auto rounded-xl border"><table className="min-w-full text-sm"><thead className="bg-gray-50"><tr>{visibleColumns.map((field)=><th key={field.key} className="px-3 py-3 text-left">{field.label}</th>)}<th className="px-3 py-3">관리</th></tr></thead><tbody>{loading?<tr><td className="p-6" colSpan={visibleColumns.length+1}>불러오는 중...</td></tr>:rows.length===0?<tr><td className="p-6" colSpan={visibleColumns.length+1}>데이터가 없습니다.</td></tr>:rows.map((row)=><tr key={String(row[config.primaryKey])} className="border-t">{visibleColumns.map((field)=><td key={field.key} className="max-w-56 truncate px-3 py-3">{String(row[field.key] ?? "-")}</td>)}<td className="whitespace-nowrap px-3 py-3"><button className="mr-2 underline" onClick={()=>setEditing(row)}>수정</button>{"is_active" in row?<button className="underline" onClick={async()=>{await deactivateResource(config,row);await load();}}>비활성</button>:null}</td></tr>)}</tbody></table></div>
    {editing ? <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"><form onSubmit={save} className="mx-auto max-w-2xl space-y-4 rounded-2xl bg-white p-6"><div className="flex justify-between"><h2 className="text-xl font-bold">{editing[config.primaryKey]?"수정":"등록"}</h2><button type="button" onClick={()=>setEditing(null)}>닫기</button></div><div className="grid gap-4 sm:grid-cols-2">{config.fields.filter((f)=>!f.readonly).map((field)=><label key={field.key} className="text-sm font-medium">{field.label}{field.type==="boolean"?<input className="ml-3" name={field.key} type="checkbox" defaultChecked={Boolean(editing[field.key] ?? true)} />:field.type==="textarea"?<textarea className="mt-2 w-full rounded-lg border px-3 py-2" name={field.key} defaultValue={String(editing[field.key] ?? "")} required={field.required} />:<input className="mt-2 w-full rounded-lg border px-3 py-2" name={field.key} type={field.type} defaultValue={String(editing[field.key] ?? "")} required={field.required} />}</label>)}</div><button className="w-full rounded-lg bg-black px-4 py-3 text-white">저장</button></form></div> : null}
  </main>;
}
