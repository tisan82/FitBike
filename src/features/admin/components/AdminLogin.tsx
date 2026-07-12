"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isAllowedAdmin, signInAdmin } from "@/features/admin/services/admin.service";

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
      const session = await signInAdmin(email, password);
      if (!isAllowedAdmin(session?.user.email)) throw new Error("관리자 권한이 없습니다.");
      router.replace("/admin");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "로그인에 실패했습니다.");
    } finally { setLoading(false); }
  }

  return <main className="mx-auto max-w-md px-5 py-16">
    <h1 className="text-3xl font-bold">FitBike Admin</h1>
    <form onSubmit={submit} className="mt-8 space-y-4 rounded-2xl border p-6">
      <label className="block text-sm font-medium">이메일<input className="mt-2 w-full rounded-lg border px-3 py-2" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required /></label>
      <label className="block text-sm font-medium">비밀번호<input className="mt-2 w-full rounded-lg border px-3 py-2" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required /></label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button className="w-full rounded-lg bg-black px-4 py-3 text-white disabled:opacity-50" disabled={loading}>{loading ? "로그인 중" : "로그인"}</button>
    </form>
  </main>;
}
