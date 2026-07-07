import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { saveAuthUser } from "../utils/auth";
import { supabase } from "../utils/supabase";
import "../styles/login.css";
//Testing --
function saveSupabaseUser(user, provider = "google") {
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

function getAuthErrorFromUrl() {
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(
    window.location.hash.replace(/^#/, ""),
  );

  return (
    searchParams.get("error_description") ||
    hashParams.get("error_description") ||
    searchParams.get("error") ||
    hashParams.get("error") ||
    ""
  );
}

export default function AuthCallbackPage() {
  const navigate = useNavigate();

  const [statusText, setStatusText] = useState("Đang xác thực tài khoản...");
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    let mounted = true;

    const finishGoogleLogin = async () => {
      try {
        const urlError = getAuthErrorFromUrl();

        if (urlError) {
          throw new Error(urlError);
        }

        const searchParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(
          window.location.hash.replace(/^#/, ""),
        );

        let session = null;

        const code = searchParams.get("code");
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        if (code) {
          setStatusText("Đang hoàn tất đăng nhập...");

          const { data, error } =
            await supabase.auth.exchangeCodeForSession(code);

          if (error) throw error;

          session = data?.session;
        } else if (accessToken && refreshToken) {
          setStatusText("Đang lưu phiên đăng nhập...");

          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) throw error;

          session = data?.session;
        } else {
          setStatusText("Đang kiểm tra phiên đăng nhập...");

          const { data, error } = await supabase.auth.getSession();

          if (error) throw error;

          session = data?.session;
        }

        const user = session?.user;

        if (!user) {
          throw new Error("Không tìm thấy phiên đăng nhập Google.");
        }

        saveSupabaseUser(user, user.app_metadata?.provider || "google");

        if (!mounted) return;

        setStatusText("Đăng nhập thành công. Đang chuyển trang...");

        setTimeout(() => {
          navigate("/", { replace: true });
        }, 450);
      } catch (error) {
        console.error("Google callback error:", error);

        if (!mounted) return;

        setStatusText("Không thể hoàn tất đăng nhập.");
        setErrorText(
          error.message ||
            "Phiên đăng nhập Google không hợp lệ. Vui lòng thử lại.",
        );
      }
    };

    finishGoogleLogin();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  return (
    <div className="auth-callback-page">
      <div className="auth-callback-card">
        {!errorText ? (
          <>
            <div className="auth-callback-spinner" aria-hidden="true" />

            <h1>Đang đăng nhập</h1>

            <p>{statusText}</p>
          </>
        ) : (
          <>
            <div className="auth-callback-error-icon" aria-hidden="true">
              !
            </div>

            <h1>Đăng nhập chưa hoàn tất</h1>

            <p>{errorText}</p>

            <button
              type="button"
              className="auth-callback-back-btn"
              onClick={() => navigate("/login", { replace: true })}
            >
              Quay về đăng nhập
            </button>
          </>
        )}
      </div>
    </div>
  );
}
