import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { saveAuthUser } from "../utils/auth";
import { supabase } from "../utils/supabase";
import "../styles/login.css";

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Đang xử lý đăng nhập Google...");

  useEffect(() => {
    let mounted = true;

    const saveUserAndGoHome = async (session) => {
      const user = session?.user;

      if (!user) {
        throw new Error("Không tìm thấy phiên đăng nhập. Vui lòng thử lại.");
      }

      saveAuthUser({
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || "",
        avatar: user.user_metadata?.avatar_url || "",
        provider: "google",
        loggedInAt: Date.now(),
      });

      if (mounted) {
        navigate("/", { replace: true });
      }
    };

    const finishLogin = async () => {
      try {
        const url = new URL(window.location.href);

        /**
         * Case 1:
         * Supabase PKCE flow:
         * /auth/callback?code=...
         */
        const code = url.searchParams.get("code");

        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(
            code
          );

          if (error) throw error;

          await saveUserAndGoHome(data.session);
          return;
        }

        /**
         * Case 2:
         * Supabase implicit flow:
         * /auth/callback#access_token=...&refresh_token=...
         */
        const hashParams = new URLSearchParams(
          window.location.hash.replace("#", "")
        );

        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        if (accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) throw error;

          await saveUserAndGoHome(data.session);
          return;
        }

        /**
         * Case 3:
         * Session already saved by Supabase.
         */
        const { data, error } = await supabase.auth.getSession();

        if (error) throw error;

        await saveUserAndGoHome(data.session);
      } catch (error) {
        console.error(error);

        if (mounted) {
          setMessage(error.message || "Đăng nhập Google thất bại.");

          setTimeout(() => {
            navigate("/login", { replace: true });
          }, 1800);
        }
      }
    };

    finishLogin();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  return (
    <div className="login-page">
      <div className="login-card auth-callback-card">
        <div className="login-card-head">
          <h2>Đăng nhập Google</h2>
          <p>{message}</p>
        </div>
      </div>
    </div>
  );
}
