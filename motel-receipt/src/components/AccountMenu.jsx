import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuthUser, logoutUser } from "../utils/auth";
import { supabase } from "../utils/supabase";

const AVATAR_BUCKET = "avatars";

function getProfileKey(user) {
  return `motel_receipt_profile_${user?.id || user?.email || "guest"}`;
}

function loadLocalProfile(user) {
  try {
    const raw = localStorage.getItem(getProfileKey(user));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalProfile(user, profile) {
  localStorage.setItem(getProfileKey(user), JSON.stringify(profile));
}

function buildAuthUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.full_name || "",
    avatar: user.user_metadata?.avatar_url || "",
    provider: "google",
  };
}

function getFileExtension(file) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return "jpg";
}

async function uploadAvatar(file, userId) {
  const ext = getFileExtension(file);
  const filePath = `${userId}/avatar.${ext}`;

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || "image/jpeg",
    });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);

  return `${data.publicUrl}?v=${Date.now()}`;
}

async function loadProfileFromSupabase(user) {
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return {
    name: data?.display_name || user.name || "",
    avatar: data?.avatar_url || user.avatar || "",
  };
}

async function saveProfileToSupabase({ userId, name, avatar }) {
  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: userId,
        display_name: name,
        avatar_url: avatar,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id",
      }
    )
    .select("display_name, avatar_url")
    .single();

  if (error) {
    throw error;
  }

  return {
    name: data?.display_name || name,
    avatar: data?.avatar_url || avatar,
  };
}

export default function AccountMenu() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const toastTimerRef = useRef(null);

  const initialUser = getAuthUser();

  const [open, setOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const [authUser, setAuthUser] = useState(() => initialUser);
  const [profile, setProfile] = useState(() => loadLocalProfile(initialUser));
  const [draftProfile, setDraftProfile] = useState(() =>
    loadLocalProfile(initialUser)
  );
  const [draftAvatarFile, setDraftAvatarFile] = useState(null);

  useEffect(() => {
    const loadUserAndProfile = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();

        if (error) {
          throw error;
        }

        const user = data?.user;

        if (!user) return;

        const nextUser = buildAuthUser(user);
        const supabaseProfile = await loadProfileFromSupabase(nextUser);

        setAuthUser(nextUser);
        setProfile(supabaseProfile);
        setDraftProfile(supabaseProfile);
        saveLocalProfile(nextUser, supabaseProfile);
      } catch (error) {
        console.error("Load profile error:", error);
      }
    };

    loadUserAndProfile();

    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
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

  const draftDisplayName = useMemo(() => {
    return (
      draftProfile.name ||
      authUser?.name ||
      authUser?.email?.split("@")[0] ||
      "Người dùng"
    );
  }, [draftProfile.name, authUser]);

  const draftAvatar = useMemo(() => {
    return draftProfile.avatar || authUser?.avatar || "";
  }, [draftProfile.avatar, authUser]);

  const firstLetter = displayName.trim().charAt(0).toUpperCase() || "U";
  const draftFirstLetter =
    draftDisplayName.trim().charAt(0).toUpperCase() || "U";

  const showToast = (message) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    setToastMessage(message);

    toastTimerRef.current = setTimeout(() => {
      setToastMessage("");
    }, 2200);
  };

  const openAccountModal = () => {
    setDraftProfile(profile);
    setDraftAvatarFile(null);
    setOpen(true);
  };

  const closeAccountModal = () => {
    setDraftProfile(profile);
    setDraftAvatarFile(null);
    setOpen(false);
  };

  const handleNameChange = (value) => {
    setDraftProfile((current) => ({
      ...current,
      name: value,
    }));
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("❌ Vui lòng chọn file hình ảnh.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onloadend = () => {
      setDraftAvatarFile(file);

      setDraftProfile((current) => ({
        ...current,
        avatar: reader.result,
      }));
    };

    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const handleConfirmProfile = async () => {
    if (!authUser?.id) {
      showToast("❌ Không tìm thấy tài khoản đang đăng nhập.");
      return;
    }

    try {
      setSaving(true);

      const nextName = String(draftProfile.name || draftDisplayName).trim();

      let nextAvatar = profile.avatar || authUser?.avatar || "";

      if (draftAvatarFile) {
        nextAvatar = await uploadAvatar(draftAvatarFile, authUser.id);
      } else if (draftProfile.avatar) {
        nextAvatar = draftProfile.avatar;
      }

      const savedProfile = await saveProfileToSupabase({
        userId: authUser.id,
        name: nextName,
        avatar: nextAvatar,
      });

      await supabase.auth.updateUser({
        data: {
          full_name: savedProfile.name,
          avatar_url: savedProfile.avatar,
        },
      });

      const nextProfile = {
        name: savedProfile.name,
        avatar: savedProfile.avatar,
      };

      setProfile(nextProfile);
      setDraftProfile(nextProfile);
      setDraftAvatarFile(null);
      saveLocalProfile(authUser, nextProfile);

      showToast("✅ Đã cập nhật tài khoản thành công.");
    } catch (error) {
      console.error("Save profile error:", error);
      showToast(error.message || "❌ Không thể cập nhật tài khoản.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut({ scope: "local" });
    logoutUser();

    navigate("/login", { replace: true });
  };

  return (
    <div className="account-menu">
      {toastMessage &&
        createPortal(
          <div className="account-toast" role="status">
            {toastMessage}
          </div>,
          document.body
        )}

      <button
        type="button"
        className="account-trigger"
        onClick={openAccountModal}
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
        <div className="account-overlay" onClick={closeAccountModal}>
          <section
            className="account-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="account-modal-header">
              <div className="account-modal-title-wrap">
                <div className="account-badge">Tài khoản</div>
                <h2>Cài đặt tài khoản</h2>
              </div>

              <button
                type="button"
                className="account-close-btn"
                onClick={closeAccountModal}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>

            <div className="account-profile-top">
              <button
                type="button"
                className="account-avatar-large"
                onClick={handleAvatarClick}
                aria-label="Đổi ảnh đại diện"
              >
                {draftAvatar ? (
                  <img src={draftAvatar} alt="Avatar" />
                ) : (
                  draftFirstLetter
                )}
              </button>

              <div className="account-profile-info">
                <h3>{draftDisplayName}</h3>
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
                value={draftProfile.name || ""}
                placeholder={authUser?.name || "Nhập tên hiển thị"}
                onChange={(event) => handleNameChange(event.target.value)}
              />
            </div>

            <div className="account-info-box">
              <p>
                Ảnh và tên hiển thị sẽ được lưu lên Supabase để dùng được trên
                nhiều thiết bị khi đăng nhập cùng một tài khoản.
              </p>
            </div>

            <button
              type="button"
              className="account-confirm-btn"
              onClick={handleConfirmProfile}
              disabled={saving}
            >
              {saving ? "Đang lưu..." : "Xác nhận"}
            </button>

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
