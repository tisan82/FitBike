"use client";
import { useEffect, useState } from "react";
import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type State = "loading" | "login" | "consent" | "error";
function followAuthRedirect(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("안전한 연결 주소가 아닙니다.");
  window.location.assign(url.href);
}
export function VisualMcpConsent({ authorizationId }: { authorizationId: string }) {
  const [state, setState] = useState<State>("loading");
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const validId = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(authorizationId);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!validId) { setError("Chat 연결 요청에서 이 화면을 열어 주세요. 유효한 연결 요청이 없습니다."); setState("error"); return; }
      setState("loading"); setError("");
      try {
        const sb = createBrowserSupabaseClient();
        const { data: session } = await sb.auth.getSession();
        if (!session.session) { if (!cancelled) setState("login"); return; }
        // Server getUser + verified-email allowlist, never browser metadata authorization.
        const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/content-pipeline-visual-mcp`, {
          method: "POST", headers: { authorization: `Bearer ${session.session.access_token}`, "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
        });
        if (!response.ok) {
          if (response.status === 401) { if (!cancelled) setState("login"); return; }
          throw new Error(response.status === 503 ? "콘텐츠 운영 계정 설정이 필요합니다." : "승인된 콘텐츠 운영 계정만 연결할 수 있습니다.");
        }
        const { data, error } = await sb.auth.oauth.getAuthorizationDetails(authorizationId);
        if (error || !data) throw new Error(error?.message ?? "연결 요청을 확인할 수 없습니다.");
        if (cancelled) return;
        if ("redirect_url" in data) { followAuthRedirect(data.redirect_url); return; }
        setDetails(data); setState("consent");
      } catch (cause) { if (!cancelled) { setError(cause instanceof Error ? cause.message : "연결 확인에 실패했습니다."); setState("error"); } }
    }
    void load();
    return () => { cancelled = true; };
  }, [authorizationId, validId, attempt]);
  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const { error } = await createBrowserSupabaseClient().auth.signInWithPassword({ email, password });
      if (error) throw error;
      setPassword(""); setAttempt(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "로그인에 실패했습니다."); }
    finally { setBusy(false); }
  }
  async function decide(allow: boolean) {
    setBusy(true); setError("");
    try {
      const oauth = createBrowserSupabaseClient().auth.oauth;
      const { data, error } = allow ? await oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true }) : await oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
      if (error || !data) throw new Error(error?.message ?? "연결 결정을 저장하지 못했습니다.");
      followAuthRedirect(data.redirect_url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "연결 처리에 실패했습니다."); setBusy(false); }
  }
  return <main className="mx-auto max-w-lg px-5 py-16">
    <p className="text-sm font-semibold text-primary">FitBike Content Factory</p>
    <h1 className="mt-2 text-2xl font-bold">콘텐츠 운영 연결</h1>
    <p className="mt-3 leading-7 text-foreground-secondary">승인된 운영 계정으로 로그인하고 요청한 앱의 연결을 확인해 주세요.</p>
    {state === "loading" && <p className="mt-6" role="status">연결 요청 확인 중…</p>}
    {state === "login" && <form onSubmit={login} className="mt-6 space-y-4 rounded-xl border border-border p-5">
      <label className="block">이메일<input className="mt-2 w-full rounded-lg border p-3" type="email" autoComplete="username" value={email} onChange={event=>setEmail(event.target.value)} required /></label>
      <label className="block">비밀번호<input className="mt-2 w-full rounded-lg border p-3" type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required /></label>
      <button className="min-h-12 w-full rounded-xl bg-primary p-3 font-bold text-primary-foreground disabled:opacity-50" disabled={busy}>로그인</button>
    </form>}
    {state === "consent" && details && <section className="mt-6 rounded-xl border border-border p-5">
      <h2 className="text-lg font-bold">{details.client.name} 연결 요청</h2>
      <p className="mt-3 break-all">계정: {details.user.email}</p>
      <p className="mt-3 break-all">요청 범위: {details.scope || "기본 인증"}</p>
      <p className="mt-3 break-all">돌아갈 주소: {details.redirect_uri}</p>
      <p className="mt-4 leading-7">연결된 운영 도구는 이미지 1건 Claim, 원본 확보·편집 요청, 후보 이미지 확인, 제작 승인 및 실패 기록을 수행할 수 있습니다. 제작 승인은 READY_FOR_UPLOAD까지이며 서비스 이미지 배포는 포함하지 않습니다.</p>
      <div className="mt-5 flex gap-3"><button onClick={()=>void decide(false)} disabled={busy} className="min-h-12 flex-1 rounded-xl border p-3 disabled:opacity-50">거절</button><button onClick={()=>void decide(true)} disabled={busy} className="min-h-12 flex-1 rounded-xl bg-primary p-3 font-bold text-primary-foreground disabled:opacity-50">연결 허용</button></div>
    </section>}
    {error && <p className="mt-5 text-red-600" role="alert">{error}</p>}
    {state === "error" && validId && <button className="mt-4 min-h-12 rounded-lg border px-4" onClick={()=>setAttempt(value=>value+1)}>다시 확인</button>}
  </main>;
}
