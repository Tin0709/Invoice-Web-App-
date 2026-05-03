import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { saveAuthUser } from "../utils/auth";
import { supabase } from "../utils/supabase";
import "../styles/login.css";

function EyeIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2.5 12C4.6 7.8 8 5.7 12 5.7C16 5.7 19.4 7.8 21.5 12C19.4 16.2 16 18.3 12 18.3C8 18.3 4.6 16.2 2.5 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="12"
        r="3.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3 3L21 21"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M2.5 12C4.6 7.8 8 5.7 12 5.7C16 5.7 19.4 7.8 21.5 12C20.8 13.4 20 14.6 19 15.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.1 14.1C13.6 14.7 12.8 15.1 12 15.1C10.3 15.1 8.9 13.7 8.9 12C8.9 11.2 9.3 10.4 9.9 9.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.6 6.9C5 8 3.6 9.7 2.5 12C4.6 16.2 8 18.3 12 18.3C13.5 18.3 14.9 18 16.1 17.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getFriendlyAuthError(errorOrMessage) {
  const originalMessage =
    typeof errorOrMessage === "string"
      ? errorOrMessage
      : errorOrMessage?.message || "";

  const text = String(originalMessage || "").toLowerCase();

  console.log("Supabase auth error:", originalMessage);

  if (
    text.includes("invalid login credentials") ||
    text.includes("invalid credentials")
  ) {
    return "Tài khoản chưa tồn tại hoặc mật khẩu chưa đúng. Nếu chưa có tài khoản, hãy bấm Đăng ký.";
  }

  if (text.includes("email not confirmed")) {
    return "Email này chưa được xác nhận. Hãy mở Gmail và bấm link xác nhận từ Supabase trước khi đăng nhập.";
  }

  if (
    text.includes("user already registered") ||
    text.includes("already registered") ||
    text.includes("already exists") ||
    text.includes("user already exists")
  ) {
    return "Email này đã được đăng ký rồi. Bạn hãy chuyển sang Đăng nhập.";
  }

  if (
    text.includes("signup is disabled") ||
    text.includes("signups not allowed") ||
    text.includes("email signups are disabled") ||
    text.includes("signups are disabled")
  ) {
    return "Chức năng đăng ký bằng email đang bị tắt trong Supabase. Hãy bật Email provider trong Supabase Auth.";
  }

  if (
    text.includes("unable to validate email address") ||
    text.includes("invalid email") ||
    text.includes("email address is invalid") ||
    text.includes("not a valid email")
  ) {
    return "Email chưa đúng định dạng hoặc bị Supabase từ chối. Hãy kiểm tra lại email.";
  }

  if (
    text.includes("password should be at least") ||
    text.includes("weak password") ||
    text.includes("password")
  ) {
    return "Mật khẩu chưa hợp lệ. Mật khẩu nên có ít nhất 6 ký tự.";
  }

  if (
    text.includes("rate limit") ||
    text.includes("security purposes") ||
    text.includes("too many requests") ||
    text.includes("over_email_send_rate_limit")
  ) {
    return "Bạn thao tác quá nhanh. Hãy chờ khoảng 1 phút rồi thử lại.";
  }

  if (text.includes("database error saving new user")) {
    return "Supabase bị lỗi khi tạo tài khoản mới. Hãy kiểm tra bảng profiles, trigger hoặc policy liên quan đến user mới.";
  }

  return originalMessage || "Có lỗi xảy ra. Vui lòng thử lại.";
}

function isExistingAccountFromSignUp(data) {
  const user = data?.user;

  if (!user) return false;

  if (Array.isArray(user.identities) && user.identities.length === 0) {
    return true;
  }

  return false;
}

function saveSupabaseUser(user, provider = "email") {
  if (!user) return;

  saveAuthUser({
    id: user.id,
    email: user.email,
    name: user.user_metadata?.full_name || "",
    avatar: user.user_metadata?.avatar_url || "",
    provider,
    loggedInAt: Date.now(),
  });
}

export default function LoginPage() {
  const navigate = useNavigate();

  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const isLogin = mode === "login";

  useEffect(() => {
    const checkSupabaseSession = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.log("Check session error:", error.message);
        return;
      }

      const session = data?.session;
      const user = session?.user;

      if (!user) return;

      saveSupabaseUser(user, user.app_metadata?.provider || "email");
      navigate("/", { replace: true });
    };

    checkSupabaseSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;

      if (!user) return;

      saveSupabaseUser(user, user.app_metadata?.provider || "email");
      navigate("/", { replace: true });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  const updateField = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));

    setError("");
    setMessage("");
  };

  const resetForm = () => {
    setForm({
      email: "",
      password: "",
      confirmPassword: "",
    });

    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const handleGoogleLogin = async () => {
    setError("");
    setMessage("");
    setIsGoogleLoading(true);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: "offline",
          prompt: "select_account",
        },
      },
    });

    if (error) {
      setError(getFriendlyAuthError(error));
      setIsGoogleLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const email = form.email.trim().toLowerCase();
    const password = form.password.trim();
    const confirmPassword = form.confirmPassword.trim();

    setError("");
    setMessage("");

    if (!email || !password) {
      setError("Vui lòng nhập email và mật khẩu.");
      return;
    }

    if (!email.includes("@") || !email.includes(".")) {
      setError("Email chưa đúng định dạng.");
      return;
    }

    if (password.length < 6) {
      setError("Mật khẩu nên có ít nhất 6 ký tự.");
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setError("Mật khẩu nhập lại chưa khớp.");
      return;
    }

    try {
      setIsEmailLoading(true);

      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          throw error;
        }

        const user = data?.user;

        if (!user) {
          throw new Error(
            "Tài khoản chưa tồn tại hoặc mật khẩu chưa đúng. Nếu chưa có tài khoản, hãy bấm Đăng ký."
          );
        }

        saveSupabaseUser(user, "email");
        navigate("/", { replace: true });
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: email.split("@")[0],
          },
        },
      });

      if (error) {
        throw error;
      }

      if (isExistingAccountFromSignUp(data)) {
        setError(
          "Email này đã được đăng ký rồi. Bạn hãy chuyển sang Đăng nhập."
        );
        return;
      }

      const user = data?.user;
      const session = data?.session;

      if (session && user) {
        saveSupabaseUser(user, "email");
        navigate("/", { replace: true });
        return;
      }

      setMessage(
        "Đã tạo tài khoản. Nếu Supabase yêu cầu xác nhận email, hãy mở Gmail và bấm link xác nhận trước khi đăng nhập."
      );

      setMode("login");
      setForm({
        email,
        password: "",
        confirmPassword: "",
      });
      setShowPassword(false);
      setShowConfirmPassword(false);
    } catch (error) {
      console.error("Email auth error:", error);
      setError(getFriendlyAuthError(error));
    } finally {
      setIsEmailLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-shell">
        <section className="login-intro">
          <div className="login-badge">Motel Receipt</div>

          <h1>Quản lý tiền phòng trọ dễ dàng hơn</h1>

          <p>
            Đăng nhập để sau này mỗi người dùng có thể lưu dữ liệu riêng trên
            server, tránh bị lẫn thông tin giữa nhiều người.
          </p>

          <div className="login-feature-list">
            <div>
              <span>✓</span>
              <p>Quản lý dãy và phòng trọ</p>
            </div>

            <div>
              <span>✓</span>
              <p>Lưu lịch sử phiếu thu theo tháng</p>
            </div>

            <div>
              <span>✓</span>
              <p>Kết nối dữ liệu với Supabase</p>
            </div>
          </div>
        </section>

        <section className="login-card">
          <div className="login-card-head">
            <h2>{isLogin ? "Đăng nhập" : "Tạo tài khoản"}</h2>

            <p className="login-subtitle">
              {isLogin
                ? "Nhập thông tin để vào trang quản lý."
                : "Tạo tài khoản mới để sử dụng hệ thống."}
            </p>
          </div>

          <button
            type="button"
            className="login-google-btn"
            onClick={handleGoogleLogin}
            disabled={isGoogleLoading || isEmailLoading}
          >
            <span className="google-icon">G</span>
            <span>
              {isGoogleLoading ? "Đang mở Google..." : "Tiếp tục với Google"}
            </span>
          </button>

          <div className="login-divider">
            <span></span>
            <p>hoặc</p>
            <span></span>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="login-field">
              <label>Email</label>

              <input
                type="email"
                placeholder="VD: user@gmail.com"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                autoComplete="email"
                disabled={isEmailLoading || isGoogleLoading}
              />
            </div>

            <div className="login-field">
              <label>Mật khẩu</label>

              <div className="password-input-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Nhập mật khẩu"
                  value={form.password}
                  onChange={(event) =>
                    updateField("password", event.target.value)
                  }
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  disabled={isEmailLoading || isGoogleLoading}
                />

                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword((current) => !current)}
                  disabled={isEmailLoading || isGoogleLoading}
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {!isLogin && (
              <div className="login-field">
                <label>Nhập lại mật khẩu</label>

                <div className="password-input-wrap">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Nhập lại mật khẩu"
                    value={form.confirmPassword}
                    onChange={(event) =>
                      updateField("confirmPassword", event.target.value)
                    }
                    autoComplete="new-password"
                    disabled={isEmailLoading || isGoogleLoading}
                  />

                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() =>
                      setShowConfirmPassword((current) => !current)
                    }
                    disabled={isEmailLoading || isGoogleLoading}
                    aria-label={
                      showConfirmPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"
                    }
                  >
                    {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>
            )}

            {error && <div className="login-error">{error}</div>}
            {message && <div className="login-success">{message}</div>}

            <button
              type="submit"
              className="login-submit-btn"
              disabled={isEmailLoading || isGoogleLoading}
            >
              {isEmailLoading
                ? isLogin
                  ? "Đang đăng nhập..."
                  : "Đang tạo tài khoản..."
                : isLogin
                ? "Đăng nhập"
                : "Tạo tài khoản"}
            </button>
          </form>

          <div className="login-switch">
            <span>{isLogin ? "Chưa có tài khoản?" : "Đã có tài khoản?"}</span>

            <button
              type="button"
              disabled={isEmailLoading || isGoogleLoading}
              onClick={() => {
                setMode(isLogin ? "register" : "login");
                setError("");
                setMessage("");
                resetForm();
              }}
            >
              {isLogin ? "Đăng ký" : "Đăng nhập"}
            </button>
          </div>

          <p className="login-note">
            Email/mật khẩu và Google đều dùng Supabase Auth để bảo vệ dữ liệu
            từng tài khoản.
          </p>
        </section>
      </div>
    </div>
  );
}
