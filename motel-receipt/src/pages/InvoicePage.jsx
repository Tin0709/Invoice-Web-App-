import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Invoice from "../components/Invoice";
import "../styles/invoice.css";
import { loadData, findBlockById, findRoomById } from "../utils/storage";

export default function InvoicePage() {
  const { blockId, roomId } = useParams();
  const navigate = useNavigate();
  const data = loadData();

  const block = findBlockById(data, blockId);
  const room = findRoomById(data, blockId, roomId);

  const [isDirty, setIsDirty] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [saveHandler, setSaveHandler] = useState(null);

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
        <div style={{ marginBottom: "16px" }}>
          <button
            type="button"
            onClick={requestGoHome}
            style={{
              textDecoration: "none",
              fontWeight: 700,
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "#5b21b6",
            }}
          >
            ← Quay về trang chủ
          </button>

          <div style={{ marginTop: "8px", color: "#6b7280", fontSize: "15px" }}>
            {block.name} - {room.roomName} - {room.tenantName}
          </div>
        </div>

        <Invoice
          blockId={blockId}
          roomId={roomId}
          roomData={room}
          onDirtyChange={setIsDirty}
          registerSaveHandler={setSaveHandler}
        />
      </div>

      {showLeaveModal && (
        <div className="confirm-overlay" onClick={handleStay}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-badge">Chưa lưu</div>
            <h3>Bạn có thay đổi chưa được lưu</h3>
            <p>Bạn muốn lưu phiếu này trước khi rời trang hay không?</p>

            <div className="confirm-actions">
              <button className="ghost-btn" onClick={handleStay}>
                Ở lại
              </button>

              <button className="ghost-btn" onClick={handleDiscard}>
                Huỷ thay đổi
              </button>

              <button className="home-primary-btn" onClick={handleSaveAndLeave}>
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
