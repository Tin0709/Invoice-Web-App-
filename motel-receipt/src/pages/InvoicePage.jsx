import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Invoice from "../components/Invoice";
import "../styles/invoice.css";
import { findBlockById, findRoomById, saveData } from "../utils/storage";
import { loadDataFromSupabase } from "../utils/supabaseStorage";

export default function InvoicePage() {
  const { blockId, roomId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [pageData, setPageData] = useState({ blocks: [] });
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [pageError, setPageError] = useState("");

  const initialYear = searchParams.get("year");
  const initialMonth = searchParams.get("month");

  const [isDirty, setIsDirty] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [saveHandler, setSaveHandler] = useState(null);

  const registerSaveHandler = useCallback((handler) => {
    setSaveHandler(() => handler);
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadInvoicePageData = async () => {
      setIsLoadingData(true);
      setPageError("");

      try {
        const serverData = await loadDataFromSupabase();

        if (!mounted) return;

        setPageData(serverData);

        /*
          Tạm thời sync xuống localStorage để Invoice.jsx hiện tại
          vẫn có thể dùng các helper cũ nếu chưa chuyển sang Supabase.
          Sau khi sửa Invoice.jsx lưu trực tiếp lên Supabase,
          dòng này có thể giữ làm cache hoặc bỏ đi.
        */
        saveData(serverData);
      } catch (error) {
        console.error("Load invoice page data error:", error);

        if (mounted) {
          setPageError(error.message || "Không thể tải dữ liệu invoice.");
        }
      } finally {
        if (mounted) {
          setIsLoadingData(false);
        }
      }
    };

    loadInvoicePageData();

    return () => {
      mounted = false;
    };
  }, [blockId, roomId]);

  const block = findBlockById(pageData, blockId);
  const room = findRoomById(pageData, blockId, roomId);

  const requestGoHome = () => {
    if (isDirty) {
      setPendingAction(() => () => navigate("/"));
      setShowLeaveModal(true);
      return;
    }

    navigate("/");
  };

  const handleDiscard = () => {
    setShowLeaveModal(false);

    if (pendingAction) {
      pendingAction();
    }
  };

  const handleStay = () => {
    setShowLeaveModal(false);
    setPendingAction(null);
  };

  const handleSaveAndLeave = async () => {
    if (typeof saveHandler === "function") {
      const ok = await saveHandler();

      if (!ok) return;
    }

    setShowLeaveModal(false);

    if (pendingAction) {
      pendingAction();
    }
  };

  if (isLoadingData) {
    return (
      <div className="page">
        <div className="invoice-page-top no-print">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="invoice-back-btn"
          >
            ← Quay về trang chủ
          </button>
        </div>

        <div className="empty-state card">
          <p>Đang tải dữ liệu invoice từ Supabase...</p>
        </div>
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="page">
        <div className="invoice-page-top no-print">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="invoice-back-btn"
          >
            ← Quay về trang chủ
          </button>
        </div>

        <div className="empty-state card">
          <h2>Không thể tải dữ liệu</h2>
          <p>{pageError}</p>
        </div>
      </div>
    );
  }

  if (!block || !room) {
    return (
      <div className="page">
        <div className="invoice-page-top no-print">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="invoice-back-btn"
          >
            ← Quay về trang chủ
          </button>
        </div>

        <div className="empty-state card">
          <h2>Không tìm thấy phòng</h2>
          <p>Phòng này có thể đã bị xoá hoặc không thuộc tài khoản hiện tại.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page">
        <div className="invoice-page-top no-print">
          <button
            type="button"
            onClick={requestGoHome}
            className="invoice-back-btn"
          >
            ← Quay về trang chủ
          </button>

          <div className="invoice-room-label">
            {block.name} - {room.roomName} - {room.tenantName}
          </div>
        </div>

        <Invoice
          blockId={blockId}
          roomId={roomId}
          roomData={room}
          initialYear={initialYear}
          initialMonth={initialMonth}
          onDirtyChange={setIsDirty}
          registerSaveHandler={registerSaveHandler}
        />
      </div>

      {showLeaveModal && (
        <div className="confirm-overlay no-print" onClick={handleStay}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-badge">Chưa lưu</div>

            <h3>Bạn có thay đổi chưa được lưu</h3>

            <p>Bạn muốn lưu phiếu này trước khi rời trang hay không?</p>

            <div className="confirm-actions">
              <button type="button" className="ghost-btn" onClick={handleStay}>
                Ở lại
              </button>

              <button
                type="button"
                className="ghost-btn"
                onClick={handleDiscard}
              >
                Huỷ thay đổi
              </button>

              <button
                type="button"
                className="home-primary-btn"
                onClick={handleSaveAndLeave}
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
