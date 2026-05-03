import "../styles/loading.css";

export default function LoadingCard({
  title = "Đang tải dữ liệu",
  message = "Đang đồng bộ dữ liệu từ Supabase...",
}) {
  return (
    <div className="loading-card">
      <div className="loading-spinner-wrap">
        <div className="loading-spinner"></div>
      </div>

      <div className="loading-content">
        <h3>{title}</h3>
        <p>{message}</p>

        <div className="loading-skeleton-list">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  );
}
