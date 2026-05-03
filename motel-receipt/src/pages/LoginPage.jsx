import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { saveAuthUser } from "../utils/auth";
import { supabase } from "../utils/supabase";
import "../styles/login.css";

function getFriendlyAuthError(message) {
  const text = String(message || "").toLowerCase();

  if (
    text.includes("invalid login credentials") ||
    text.includes("invalid credentials") ||
    text.includes("email not confirmed")
  ) {
    return "Tài khoản chưa tồn tại hoặc mật khẩu chưa đúng. Nếu chưa có tài khoản, hãy bấm Đăng ký.";
  }

  if (
    text.includes("user already registered") ||
    text.includes("already registered")
  ) {
    return "Email này đã được đăng ký. Bạn hãy chuyển sang Đăng nhập.";
  }

  if (text.includes("password")) {
    return "Mật khẩu chưa hợp lệ. Mật khẩu nên có ít nhất 6 ký tự.";
  }

  if (text.includes("email")) {
    return "Email chưa hợp lệ hoặc chưa được xác nhận.";
  }

  return message || "Có lỗi xảy ra. Vui lòng thử lại.";
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

      if (error) return;

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
      setError(getFriendlyAuthError(error.message));
      setIsGoogleLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const email = form.email.trim();
    const password = form.password.trim();
    const confirmPassword = form.confirmPassword.trim();

    setError("");
    setMessage("");

    if (!email || !password) {
      setError("Vui lòng nhập email và mật khẩu.");
      return;
    }

    if (!email.includes("@")) {
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

      const user = data?.user;
      const session = data?.session;

      if (session && user) {
        saveSupabaseUser(user, "email");
        navigate("/", { replace: true });
        return;
      }

      setMessage(
        "Đã tạo tài khoản. Nếu Supabase yêu cầu xác nhận email, bạn hãy kiểm tra hộp thư trước khi đăng nhập."
      );
      setMode("login");
      setForm((prev) => ({
        ...prev,
        password: "",
        confirmPassword: "",
      }));
    } catch (error) {
      console.error("Email auth error:", error);
      setError(getFriendlyAuthError(error.message));
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
                onChange={(e) => updateField("email", e.target.value)}
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
                  onChange={(e) => updateField("password", e.target.value)}
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
                  {showPassword ? "🙈" : "👁️"}
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
                    onChange={(e) =>
                      updateField("confirmPassword", e.target.value)
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
                    {showConfirmPassword ? "🙈" : "👁️"}
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
                setShowPassword(false);
                setShowConfirmPassword(false);

                setForm({
                  email: "",
                  password: "",
                  confirmPassword: "",
                });
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
