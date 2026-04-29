import { useCallback, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Invoice from "../components/Invoice";
import "../styles/invoice.css";
import { loadData, findBlockById, findRoomById } from "../utils/storage";

export default function InvoicePage() {
  const { blockId, roomId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  /*
    Không gọi loadData() trực tiếp ở ngoài state.
    Nếu gọi trực tiếp, mỗi lần render lại có thể làm roomData đổi object
    và gây reset form trong Invoice.
  */
  const [pageData] = useState(() => loadData());

  const block = findBlockById(pageData, blockId);
  const room = findRoomById(pageData, blockId, roomId);

  const initialYear = searchParams.get("year");
  const initialMonth = searchParams.get("month");

  const [isDirty, setIsDirty] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [saveHandler, setSaveHandler] = useState(null);

  const registerSaveHandler = useCallback((handler) => {
    setSaveHandler(() => handler);
  }, []);

  if (!block || !room) {
    return (
      <div className="page">
        <h2>Không tìm thấy phòng</h2>
      </div>
    );
  }

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
