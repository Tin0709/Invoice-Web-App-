import { Link, useParams } from "react-router-dom";
import Invoice from "../components/Invoice";
import "../styles/invoice.css";
import { loadData, findBlockById, findRoomById } from "../utils/storage";

export default function InvoicePage() {
  const { blockId, roomId } = useParams();
  const data = loadData();

  const block = findBlockById(data, blockId);
  const room = findRoomById(data, blockId, roomId);

  if (!block || !room) {
    return (
      <div style={{ padding: "24px" }}>
        <Link to="/" style={{ display: "inline-block", marginBottom: "16px" }}>
          ← Quay về trang chủ
        </Link>
        <h2>Không tìm thấy phòng</h2>
      </div>
    );
  }

  return (
    <div className="page">
      <div style={{ marginBottom: "16px" }}>
        <Link to="/" style={{ textDecoration: "none" }}>
          ← Quay về trang chủ
        </Link>
        <div style={{ marginTop: "8px", color: "#6b7280" }}>
          {block.name} - {room.roomName} - {room.tenantName}
        </div>
      </div>

      <Invoice />
    </div>
  );
}
