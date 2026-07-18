import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, X, KeyRound, Loader2, Check, Trash2, Copy } from "lucide-react";

type Factor = {
  id: string;
  friendly_name?: string | null;
  factor_type: string;
  status: "verified" | "unverified";
  created_at: string;
};

type EnrollData = {
  id: string;
  qr: string; // svg string
  secret: string;
  uri: string;
};

export function TwoFactorButton({ onOpen }: { onOpen: () => void }) {
  const [hasFactor, setHasFactor] = useState(false);
  const [aal, setAal] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setHasFactor(!!data?.totp?.some((f) => f.status === "verified"));
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setAal(aalData?.currentLevel ?? null);
  }, []);

  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => refresh());
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="rounded border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 font-mono text-xs uppercase tracking-widest text-emerald-300 transition hover:border-emerald-400 hover:bg-emerald-500/15 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
      aria-label="Manage two-factor authentication"
      title={hasFactor ? `2FA enabled · aal=${aal}` : "Enable 2FA"}
    >
      <ShieldCheck className="mr-1.5 -mt-0.5 inline h-3.5 w-3.5" />
      &gt; 2fa{hasFactor ? <span className="ml-1 text-emerald-400">[on]</span> : <span className="ml-1 text-amber-400">[off]</span>}
    </button>
  );
}

export function TwoFactorModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(false);
  const [enroll, setEnroll] = useState<EnrollData | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [aal, setAal] = useState<{ current: string | null; next: string | null }>({ current: null, next: null });
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) setErr(error.message);
    setFactors((data?.totp ?? []) as Factor[]);
    const { data: a } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setAal({ current: a?.currentLevel ?? null, next: a?.nextLevel ?? null });
  }, []);

  useEffect(() => {
    if (open) {
      setErr(null);
      setOk(null);
      setEnroll(null);
      setCode("");
      load();
    }
  }, [open, load]);

  const startEnroll = async () => {
    setErr(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `authenticator-${Date.now()}`,
      });
      if (error) throw error;
      setEnroll({
        id: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
        uri: data.totp.uri,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "enroll failed");
    } finally {
      setLoading(false);
    }
  };

  const verifyEnroll = async () => {
    if (!enroll) return;
    setErr(null);
    setLoading(true);
    try {
      const { data: chal, error: chalErr } = await supabase.auth.mfa.challenge({ factorId: enroll.id });
      if (chalErr) throw chalErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: enroll.id,
        challengeId: chal.id,
        code: code.trim(),
      });
      if (vErr) throw vErr;
      setOk("2FA enabled successfully");
      setEnroll(null);
      setCode("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "verification failed");
    } finally {
      setLoading(false);
    }
  };

  const challengeExisting = async (factorId: string) => {
    setErr(null);
    setLoading(true);
    try {
      const { data: chal, error: chalErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chalErr) throw chalErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: chal.id,
        code: code.trim(),
      });
      if (vErr) throw vErr;
      setOk("Verified · session elevated to aal2");
      setCode("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "verification failed");
    } finally {
      setLoading(false);
    }
  };

  const remove = async (factorId: string) => {
    setErr(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      setOk("Factor removed");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "unenroll failed");
    } finally {
      setLoading(false);
    }
  };

  const copySecret = async () => {
    if (!enroll) return;
    await navigator.clipboard.writeText(enroll.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!open) return null;

  const verified = factors.filter((f) => f.status === "verified");
  const needsChallenge = aal.current === "aal1" && aal.next === "aal2" && verified.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tfa-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-lg border border-emerald-500/30 bg-neutral-950 p-6 shadow-[0_0_60px_rgba(52,211,153,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded p-1 text-emerald-400/60 hover:bg-emerald-500/10 hover:text-emerald-300"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-emerald-300" />
          <h2 id="tfa-title" className="font-mono text-sm uppercase tracking-widest text-emerald-200">
            two_factor_auth · totp
          </h2>
        </div>

        <div className="mb-4 rounded border border-emerald-500/20 bg-black/40 p-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/70">
          aal_current={aal.current ?? "n/a"} · aal_next={aal.next ?? "n/a"}
        </div>

        {err && (
          <div className="mb-3 rounded border border-rose-500/40 bg-rose-500/10 p-2 font-mono text-xs text-rose-300">
            err: {err}
          </div>
        )}
        {ok && (
          <div className="mb-3 rounded border border-emerald-500/40 bg-emerald-500/10 p-2 font-mono text-xs text-emerald-300">
            <Check className="mr-1 inline h-3 w-3" /> {ok}
          </div>
        )}

        {enroll ? (
          <div className="space-y-3">
            <p className="font-mono text-xs text-emerald-300/80">
              Scan the QR in Google Authenticator / Authy / 1Password, then enter the 6-digit code.
            </p>
            <div className="flex justify-center rounded border border-emerald-500/30 bg-white p-3">
              <div dangerouslySetInnerHTML={{ __html: enroll.qr }} />
            </div>
            <div className="flex items-center gap-2 rounded border border-emerald-500/20 bg-black/40 p-2 font-mono text-[11px] text-emerald-300/90">
              <span className="truncate">{enroll.secret}</span>
              <button
                type="button"
                onClick={copySecret}
                className="ml-auto rounded border border-emerald-500/30 px-2 py-0.5 text-[10px] uppercase text-emerald-300 hover:bg-emerald-500/10"
              >
                {copied ? "copied" : <><Copy className="mr-1 inline h-3 w-3" />copy</>}
              </button>
            </div>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded border border-emerald-500/30 bg-black/60 px-3 py-2 text-center font-mono text-lg tracking-[0.5em] text-emerald-200 outline-none focus:border-emerald-400"
              aria-label="One-time code"
            />
            <div className="flex gap-2">
              <button
                onClick={verifyEnroll}
                disabled={loading || code.length !== 6}
                className="flex-1 rounded border border-emerald-400/50 bg-emerald-500/10 px-3 py-2 font-mono text-xs uppercase tracking-widest text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
              >
                {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "> verify_&_enable"}
              </button>
              <button
                onClick={() => { setEnroll(null); setCode(""); load(); }}
                className="rounded border border-emerald-500/20 px-3 py-2 font-mono text-xs uppercase tracking-widest text-emerald-400/70 hover:bg-emerald-500/5"
              >
                cancel
              </button>
            </div>
          </div>
        ) : needsChallenge ? (
          <div className="space-y-3">
            <p className="font-mono text-xs text-amber-300/90">
              Your session is aal1. Enter your Authenticator code to elevate to aal2.
            </p>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded border border-emerald-500/30 bg-black/60 px-3 py-2 text-center font-mono text-lg tracking-[0.5em] text-emerald-200 outline-none focus:border-emerald-400"
              aria-label="One-time code"
            />
            <button
              onClick={() => challengeExisting(verified[0].id)}
              disabled={loading || code.length !== 6}
              className="w-full rounded border border-emerald-400/50 bg-emerald-500/10 px-3 py-2 font-mono text-xs uppercase tracking-widest text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "> verify_totp"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {factors.length === 0 ? (
              <p className="font-mono text-xs text-emerald-300/70">
                No authenticator enrolled. Add one to protect account access with a rotating 6-digit code.
              </p>
            ) : (
              <ul className="space-y-2">
                {factors.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between rounded border border-emerald-500/20 bg-black/40 p-2 font-mono text-xs"
                  >
                    <div>
                      <div className="text-emerald-200">{f.friendly_name ?? "authenticator"}</div>
                      <div className="text-[10px] uppercase text-emerald-500/60">
                        {f.factor_type} · {f.status}
                      </div>
                    </div>
                    <button
                      onClick={() => remove(f.id)}
                      className="rounded border border-rose-500/30 p-1.5 text-rose-300 hover:bg-rose-500/10"
                      aria-label="Remove factor"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={startEnroll}
              disabled={loading}
              className="w-full rounded border border-emerald-400/50 bg-emerald-500/10 px-3 py-2 font-mono text-xs uppercase tracking-widest text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "> enroll_new_authenticator"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
