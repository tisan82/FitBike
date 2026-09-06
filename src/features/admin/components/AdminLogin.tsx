"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInAdmin, signOutAdmin, verifyAdminSession } from "@/features/admin/services/admin.service";

export function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true); setError(null);
    try {
      await signInAdmin(email, password);
      if (!await verifyAdminSession()) {
        await signOutAdmin();
        throw new Error("관리자 권한이 없습니다.");
      }
      router.replace("/admin");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "로그인에 실패했습니다.");
    } finally { setLoading(false); }
  }

  return <main className="mx-auto max-w-md px-5 py-16 sm:py-24">
    <p className="text-sm font-semibold text-primary">FitBike Operations</p><h1 className="mt-2 text-3xl font-bold">관리자 로그인</h1><p className="mt-3 text-base leading-7 text-foreground-secondary">승인된 운영 계정만 접속할 수 있습니다.</p>
    <form onSubmit={submit} className="mt-8 space-y-5 rounded-2xl border border-border bg-surface p-6">
      <label className="block text-sm font-medium">이메일<input className="mt-2 w-full rounded-lg border px-3 py-2" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required /></label>
      <label className="block text-sm font-medium">비밀번호<input className="mt-2 w-full rounded-lg border px-3 py-2" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required /></label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button className="min-h-12 w-full rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground disabled:opacity-50" disabled={loading}>{loading ? "인증 확인 중" : "로그인"}</button>
    </form>
  </main>;
}
