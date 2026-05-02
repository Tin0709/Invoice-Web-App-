import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { saveAuthUser } from "../utils/auth";
import { supabase } from "../utils/supabase";
import "../styles/login.css";

export default function LoginPage() {
  const navigate = useNavigate();

  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const isLogin = mode === "login";

  useEffect(() => {
    const checkSupabaseSession = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (error) return;

      const session = data?.session;
      const user = session?.user;

      if (!user) return;

      saveAuthUser({
        id: user.id,
        email: user.email,
        provider: "google",
        loggedInAt: Date.now(),
      });

      navigate("/", { replace: true });
    };

    checkSupabaseSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;

      if (!user) return;

      saveAuthUser({
        id: user.id,
        email: user.email,
        provider: "google",
        loggedInAt: Date.now(),
      });

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
  };

  const handleGoogleLogin = async () => {
    setError("");
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
      setError(error.message);
      setIsGoogleLoading(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const email = form.email.trim();
    const password = form.password.trim();
    const confirmPassword = form.confirmPassword.trim();

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

    const fakeUser = {
      email,
      provider: "local-demo",
      loggedInAt: Date.now(),
    };

    saveAuthUser(fakeUser);

    navigate("/");
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
              <p>Chuẩn bị kết nối server/database</p>
            </div>
          </div>
        </section>

        <section className="login-card">
          <div className="login-card-head">
            <h2>{isLogin ? "Đăng nhập" : "Tạo tài khoản"}</h2>

            <p>
              {isLogin
                ? "Nhập thông tin để vào trang quản lý."
                : "Tạo tài khoản mới để sử dụng hệ thống."}
            </p>
          </div>

          <button
            type="button"
            className="login-google-btn"
            onClick={handleGoogleLogin}
            disabled={isGoogleLoading}
          >
            <span className="google-icon">G</span>
            {isGoogleLoading ? "Đang mở Google..." : "Tiếp tục với Google"}
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
              />
            </div>

            <div className="login-field">
              <label>Mật khẩu</label>

              <input
                type="password"
                placeholder="Nhập mật khẩu"
                value={form.password}
                onChange={(e) => updateField("password", e.target.value)}
              />
            </div>

            {!isLogin && (
              <div className="login-field">
                <label>Nhập lại mật khẩu</label>

                <input
                  type="password"
                  placeholder="Nhập lại mật khẩu"
                  value={form.confirmPassword}
                  onChange={(e) =>
                    updateField("confirmPassword", e.target.value)
                  }
                />
              </div>
            )}

            {error && <div className="login-error">{error}</div>}

            <button type="submit" className="login-submit-btn">
              {isLogin ? "Đăng nhập" : "Tạo tài khoản"}
            </button>
          </form>

          <div className="login-switch">
            {isLogin ? "Chưa có tài khoản?" : "Đã có tài khoản?"}

            <button
              type="button"
              onClick={() => {
                setMode(isLogin ? "register" : "login");
                setError("");
              }}
            >
              {isLogin ? "Đăng ký" : "Đăng nhập"}
            </button>
          </div>

          <p className="login-note">
            Nút Google đang dùng Supabase Auth. Phần email/mật khẩu bên dưới
            hiện vẫn là đăng nhập tạm thời để test giao diện.
          </p>
        </section>
      </div>
    </div>
  );
}
