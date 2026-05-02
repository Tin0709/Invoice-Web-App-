import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuthUser, logoutUser } from "../utils/auth";
import { supabase } from "../utils/supabase";

function getProfileKey(user) {
  return `motel_receipt_profile_${user?.id || user?.email || "guest"}`;
}

function loadProfile(user) {
  try {
    const raw = localStorage.getItem(getProfileKey(user));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveProfile(user, profile) {
  localStorage.setItem(getProfileKey(user), JSON.stringify(profile));
}

export default function AccountMenu() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [authUser, setAuthUser] = useState(() => getAuthUser());
  const [profile, setProfile] = useState(() => loadProfile(getAuthUser()));

  useEffect(() => {
    const loadSupabaseUser = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;

      if (!user) return;

      const nextUser = {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || "",
        avatar: user.user_metadata?.avatar_url || "",
        provider: "google",
      };

      setAuthUser(nextUser);

      const savedProfile = loadProfile(nextUser);
      setProfile(savedProfile);
    };

    loadSupabaseUser();
  }, []);

  const displayName = useMemo(() => {
    return (
      profile.name ||
      authUser?.name ||
      authUser?.email?.split("@")[0] ||
      "Người dùng"
    );
  }, [profile.name, authUser]);

  const avatar = useMemo(() => {
    return profile.avatar || authUser?.avatar || "";
  }, [profile.avatar, authUser]);

  const firstLetter = displayName.trim().charAt(0).toUpperCase() || "U";

  const handleNameChange = (value) => {
    const nextProfile = {
      ...profile,
      name: value,
    };

    setProfile(nextProfile);
    saveProfile(authUser, nextProfile);
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      const nextProfile = {
        ...profile,
        avatar: reader.result,
      };

      setProfile(nextProfile);
      saveProfile(authUser, nextProfile);
    };

    reader.readAsDataURL(file);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut({ scope: "local" });
    logoutUser();

    navigate("/login", { replace: true });
  };

  return (
    <div className="account-menu">
      <button
        type="button"
        className="account-trigger"
        onClick={() => setOpen(true)}
      >
        <span className="account-avatar">
          {avatar ? <img src={avatar} alt="Avatar" /> : firstLetter}
        </span>

        <span className="account-trigger-text">
          <strong>{displayName}</strong>
          <small>{authUser?.email || "Đang đăng nhập"}</small>
        </span>
      </button>

      {open && (
        <div className="account-overlay" onClick={() => setOpen(false)}>
          <section
            className="account-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="account-modal-header">
              <div>
                <div className="account-badge">Tài khoản</div>
                <h2>Cài đặt tài khoản</h2>
              </div>

              <button
                type="button"
                className="account-close-btn"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="account-profile-top">
              <button
                type="button"
                className="account-avatar-large"
                onClick={handleAvatarClick}
              >
                {avatar ? <img src={avatar} alt="Avatar" /> : firstLetter}
              </button>

              <div>
                <h3>{displayName}</h3>
                <p>{authUser?.email || "Không có email"}</p>

                <button
                  type="button"
                  className="account-change-avatar-btn"
                  onClick={handleAvatarClick}
                >
                  Đổi ảnh đại diện
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleAvatarChange}
                />
              </div>
            </div>

            <div className="account-field">
              <label>Tên hiển thị</label>

              <input
                type="text"
                value={profile.name || ""}
                placeholder={authUser?.name || "Nhập tên hiển thị"}
                onChange={(event) => handleNameChange(event.target.value)}
              />
            </div>

            <div className="account-info-box">
              <p>
                Ảnh và tên hiển thị hiện đang lưu tạm trên trình duyệt cho từng
                tài khoản. Sau này mình có thể chuyển sang lưu trên Supabase.
              </p>
            </div>

            <button
              type="button"
              className="account-logout-btn"
              onClick={handleLogout}
            >
              Đăng xuất
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
