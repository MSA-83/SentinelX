// src/pages/auth/LoginPage.tsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { authService } from "@/lib/auth";
import { mapSupabaseUser } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";

type LoginStep = "email" | "otp" | "password" | "set-password";

export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<LoginStep>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [username, setUsername] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [bootLines, setBootLines] = useState<string[]>([]);

  // Redirect if already authenticated
  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  // Boot sequence animation
  useEffect(() => {
    const lines = [
      "SENTINEL-X AUTHENTICATION GATEWAY v6.3",
      "Copyright © SENTCOM. All rights reserved.",
      "Initializing secure channel...",
      "Verifying TLS 1.3 certificate chain... [OK]",
      "Loading cryptographic modules... [OK]",
      "Identity provider: SENTCOM-IAM",
      "Classification: TOP SECRET // SENTINEL // NOFORN",
      "Two-factor authentication REQUIRED.",
      "Awaiting operator credentials...",
    ];
    let i = 0;
    const iv = setInterval(() => {
      if (i < lines.length) {
        setBootLines((prev) => [...prev, lines[i]]);
        i++;
      } else {
        clearInterval(iv);
      }
    }, 120);
    return () => clearInterval(iv);
  }, []);

  const handleEmailSubmit = async () => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      if (mode === "register") {
        await authService.sendOtp(email.trim());
        setStep("otp");
        toast.success("OTP dispatched to secure channel");
      } else {
        // Check if user exists — try signing in
        setStep("password");
      }
    } catch (err: unknown) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!password) return;
    setLoading(true);
    try {
      const user = await authService.signInWithPassword(email, password);
      login(mapSupabaseUser(user));
      navigate("/");
    } catch (err: unknown) {
      toast.error((err as Error).message);
      setLoading(false);
    }
  };

  const handleOtpVerify = async () => {
    if (!otp || !password) return;
    setLoading(true);
    try {
      const user = await authService.verifyOtpAndSetPassword(email, otp, password, username);
      login(mapSupabaseUser(user));
      navigate("/");
    } catch (err: unknown) {
      toast.error((err as Error).message);
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      toast.error("Enter your email first");
      return;
    }
    setLoading(true);
    try {
      await authService.sendOtp(email.trim());
      setStep("otp");
      toast.success("Reset OTP dispatched to secure channel");
    } catch (err: unknown) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-sx-bg relative overflow-hidden"
      style={{ background: "#020617" }}
    >
      {/* Background grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Radar sweep bg */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: "50%",
          left: "50%",
          width: 900,
          height: 900,
          borderRadius: "50%",
          border: "1px solid rgba(0,212,255,0.04)",
          transform: "translate(-50%, -50%)",
          boxShadow: "0 0 80px rgba(0,212,255,0.05) inset",
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          top: "50%",
          left: "50%",
          width: 500,
          height: 500,
          borderRadius: "50%",
          border: "1px solid rgba(0,212,255,0.06)",
          transform: "translate(-50%, -50%)",
        }}
      />

      {/* Scanlines */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.065) 2px,rgba(0,0,0,0.065) 4px)",
        }}
      />

      <div className="relative z-10 w-full max-w-md px-4">
        {/* Classification banner */}
        <div
          className="text-center mb-6 py-1 border border-sx-red/40 rounded"
          style={{ background: "rgba(239,68,68,0.08)" }}
        >
          <span
            className="font-mono text-[10px] font-bold tracking-[0.3em]"
            style={{ color: "#ef4444", textShadow: "0 0 8px rgba(239,68,68,0.5)" }}
          >
            ⚠ TOP SECRET // SENTINEL // NOFORN ⚠
          </span>
        </div>

        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-sm mb-4"
            style={{
              background: "rgba(0,212,255,0.1)",
              border: "1px solid rgba(0,212,255,0.35)",
              boxShadow: "0 0 24px rgba(0,212,255,0.15)",
            }}
          >
            <span className="font-display font-bold text-2xl" style={{ color: "#00d4ff" }}>SX</span>
          </div>
          <h1
            className="font-display font-bold text-3xl tracking-[0.3em] mb-1"
            style={{ color: "#00d4ff", textShadow: "0 0 16px rgba(0,212,255,0.4)" }}
          >
            SENTINEL-X
          </h1>
          <p className="font-mono text-[10px] tracking-[0.2em]" style={{ color: "#475569" }}>
            GLOBAL SITUATIONAL AWARENESS PLATFORM
          </p>
        </div>

        {/* Main auth card */}
        <div
          className="rounded border overflow-hidden"
          style={{
            background: "#0d1424",
            borderColor: "#1e3a5f",
            boxShadow: "0 0 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(0,212,255,0.06)",
          }}
        >
          {/* Boot log */}
          <div
            className="px-4 py-3 border-b overflow-hidden"
            style={{ borderColor: "#0f2040", background: "#080e1a", maxHeight: 120 }}
          >
            <div className="space-y-0.5 overflow-hidden">
              {bootLines.map((line, i) => (
                <div
                  key={i}
                  className="font-mono text-[9px] leading-relaxed animate-fade-in"
                  style={{ color: i === bootLines.length - 1 ? "#00d4ff" : "#334155" }}
                >
                  {i === bootLines.length - 1 ? `> ${line}` : `  ${line}`}
                </div>
              ))}
            </div>
          </div>

          {/* Form area */}
          <div className="p-6 space-y-4">
            {/* Mode toggle */}
            {step === "email" && (
              <div
                className="flex rounded overflow-hidden mb-2"
                style={{ border: "1px solid #0f2040" }}
              >
                {(["login", "register"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className="flex-1 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-all"
                    style={{
                      background: mode === m ? "rgba(0,212,255,0.12)" : "transparent",
                      color: mode === m ? "#00d4ff" : "#475569",
                      borderRight: m === "login" ? "1px solid #0f2040" : "none",
                    }}
                  >
                    {m === "login" ? "AUTHENTICATE" : "REQUEST ACCESS"}
                  </button>
                ))}
              </div>
            )}

            {/* Email step */}
            {step === "email" && (
              <>
                <div>
                  <label className="font-mono text-[9px] tracking-widest mb-1.5 block" style={{ color: "#475569" }}>
                    OPERATOR EMAIL
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleEmailSubmit()}
                    placeholder="analyst@sentcom.mil"
                    autoComplete="email"
                    className="w-full px-3 py-2 rounded font-mono text-sm outline-none transition-all"
                    style={{
                      background: "#080e1a",
                      border: "1px solid #1e3a5f",
                      color: "#e2e8f0",
                      caretColor: "#00d4ff",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#00d4ff50")}
                    onBlur={(e) => (e.target.style.borderColor = "#1e3a5f")}
                  />
                </div>
                <button
                  onClick={handleEmailSubmit}
                  disabled={loading || !email.trim()}
                  className="w-full py-2.5 rounded font-mono text-sm font-bold tracking-[0.2em] uppercase transition-all"
                  style={{
                    background: loading ? "rgba(0,212,255,0.06)" : "rgba(0,212,255,0.15)",
                    border: "1px solid rgba(0,212,255,0.35)",
                    color: loading ? "#475569" : "#00d4ff",
                    cursor: loading ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "VERIFYING..." : mode === "login" ? "AUTHENTICATE →" : "REQUEST OTP →"}
                </button>
              </>
            )}

            {/* Password step (login) */}
            {step === "password" && (
              <>
                <div className="font-mono text-[10px] px-3 py-2 rounded" style={{ background: "#080e1a", color: "#475569", border: "1px solid #0f2040" }}>
                  IDENTITY: <span style={{ color: "#00d4ff" }}>{email}</span>
                </div>
                <div>
                  <label className="font-mono text-[9px] tracking-widest mb-1.5 block" style={{ color: "#475569" }}>
                    PASSPHRASE
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    className="w-full px-3 py-2 rounded font-mono text-sm outline-none"
                    style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#e2e8f0", caretColor: "#00d4ff" }}
                    onFocus={(e) => (e.target.style.borderColor = "#00d4ff50")}
                    onBlur={(e) => (e.target.style.borderColor = "#1e3a5f")}
                  />
                </div>
                <button
                  onClick={handleLogin}
                  disabled={loading || !password}
                  className="w-full py-2.5 rounded font-mono text-sm font-bold tracking-widest uppercase transition-all"
                  style={{
                    background: "rgba(0,212,255,0.15)",
                    border: "1px solid rgba(0,212,255,0.35)",
                    color: "#00d4ff",
                    cursor: loading ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "AUTHENTICATING..." : "AUTHENTICATE →"}
                </button>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setStep("email")}
                    className="font-mono text-[9px] transition-colors"
                    style={{ color: "#475569" }}
                    onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "#00d4ff")}
                    onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "#475569")}
                  >
                    ← BACK
                  </button>
                  <button
                    onClick={handleForgotPassword}
                    className="font-mono text-[9px] transition-colors"
                    style={{ color: "#475569" }}
                    onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "#00d4ff")}
                    onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "#475569")}
                  >
                    RESET PASSPHRASE
                  </button>
                </div>
              </>
            )}

            {/* OTP + set password step (register) */}
            {step === "otp" && (
              <>
                <div className="font-mono text-[10px] px-3 py-2 rounded" style={{ background: "#080e1a", color: "#475569", border: "1px solid #0f2040" }}>
                  OTP dispatched to: <span style={{ color: "#00d4ff" }}>{email}</span>
                </div>
                {[
                  { label: "OTP CODE (4 digits)", value: otp, setter: setOtp, type: "text", placeholder: "0000", auto: "one-time-code" },
                  { label: "CALLSIGN / USERNAME", value: username, setter: setUsername, type: "text", placeholder: "FALCON-7", auto: "username" },
                  { label: "SET PASSPHRASE (min 6 chars)", value: password, setter: setPassword, type: "password", placeholder: "••••••••", auto: "new-password" },
                ].map(({ label, value, setter, type, placeholder, auto }) => (
                  <div key={label}>
                    <label className="font-mono text-[9px] tracking-widest mb-1.5 block" style={{ color: "#475569" }}>
                      {label}
                    </label>
                    <input
                      type={type}
                      value={value}
                      onChange={(e) => setter(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleOtpVerify()}
                      placeholder={placeholder}
                      autoComplete={auto}
                      className="w-full px-3 py-2 rounded font-mono text-sm outline-none"
                      style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#e2e8f0", caretColor: "#00d4ff" }}
                      onFocus={(e) => (e.target.style.borderColor = "#00d4ff50")}
                      onBlur={(e) => (e.target.style.borderColor = "#1e3a5f")}
                    />
                  </div>
                ))}
                <button
                  onClick={handleOtpVerify}
                  disabled={loading || !otp || !password}
                  className="w-full py-2.5 rounded font-mono text-sm font-bold tracking-widest uppercase transition-all"
                  style={{
                    background: "rgba(0,212,255,0.15)",
                    border: "1px solid rgba(0,212,255,0.35)",
                    color: "#00d4ff",
                    cursor: loading ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "VERIFYING IDENTITY..." : "ACTIVATE ACCOUNT →"}
                </button>
                <button onClick={() => setStep("email")} className="font-mono text-[9px] w-full text-center" style={{ color: "#475569" }}>
                  ← BACK
                </button>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 space-y-1">
          <div className="font-mono text-[9px]" style={{ color: "#1e3a5f" }}>
            UNAUTHORIZED ACCESS IS A FEDERAL CRIME UNDER 18 U.S.C. § 1030
          </div>
          <div className="font-mono text-[9px]" style={{ color: "#1e3a5f" }}>
            ALL SESSIONS ARE MONITORED AND RECORDED · SENTCOM-IAM
          </div>
        </div>
      </div>
    </div>
  );
}
