import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/history.css";
import {
  deleteInvoice,
  deleteInvoicesByMonth,
  formatCurrency,
  getAllInvoicesFlat,
  loadData,
} from "../utils/storage";

function groupInvoicesByMonth(invoices) {
  const map = new Map();

  invoices.forEach((item) => {
    const key = `${item.month}/${item.year}`;

    if (!map.has(key)) {
      map.set(key, {
        key,
        month: item.month,
        year: item.year,
        items: [],
      });
    }

    map.get(key).items.push(item);
  });

  return Array.from(map.values());
}

export default function HistoryPage() {
  const [data, setData] = useState(() => loadData());
  const [confirmState, setConfirmState] = useState({
    open: false,
    title: "",
    message: "",
    onConfirm: null,
  });

  const invoices = useMemo(() => getAllInvoicesFlat(data), [data]);
  const grouped = useMemo(() => groupInvoicesByMonth(invoices), [invoices]);

  const openConfirm = ({ title, message, onConfirm }) => {
    setConfirmState({
      open: true,
      title,
      message,
      onConfirm,
    });
  };

  const closeConfirm = () => {
    setConfirmState({
      open: false,
      title: "",
      message: "",
      onConfirm: null,
    });
  };

  const handleConfirmOk = () => {
    if (typeof confirmState.onConfirm === "function") {
      confirmState.onConfirm();
    }
    closeConfirm();
  };

  const handleDeleteOne = (item) => {
    openConfirm({
      title: "Xoá lịch sử",
      message: `Bạn có muốn xoá lịch sử ${item.roomName} - ${item.month}/${item.year} không?`,
      onConfirm: () => {
        const next = deleteInvoice(
          item.blockId,
          item.roomId,
          item.year,
          item.month
        );
        setData(next);
      },
    });
  };

  const handleDeleteMonth = (group) => {
    openConfirm({
      title: "Xoá lịch sử theo tháng",
      message: `Bạn có chắc muốn xoá toàn bộ lịch sử của tháng ${group.month}/${group.year} không?`,
      onConfirm: () => {
        const next = deleteInvoicesByMonth(group.year, group.month);
        setData(next);
      },
    });
  };

  return (
    <>
      <div className="history-page">
        <div className="history-shell">
          <div className="history-topbar">
            <div>
              <Link className="history-back" to="/">
                ← Quay về trang chủ
              </Link>
              <h1>Quản lí lịch sử phiếu</h1>
              <p>
                Xem toàn bộ phiếu đã lưu, nhóm theo từng tháng để dễ quản lí.
              </p>
            </div>
          </div>

          {grouped.length === 0 ? (
            <div className="history-empty-card">
              <h3>Chưa có lịch sử nào</h3>
              <p>Khi bạn lưu invoice, lịch sử sẽ xuất hiện ở đây.</p>
            </div>
          ) : (
            <div className="timeline-groups">
              {grouped.map((group) => (
                <section className="timeline-group" key={group.key}>
                  <div className="timeline-group-header">
                    <div>
                      <h2>
                        {group.month}/{group.year}
                      </h2>
                      <span>{group.items.length} phiếu</span>
                    </div>

                    <button
                      className="danger-btn"
                      onClick={() => handleDeleteMonth(group)}
                    >
                      Xoá tháng này
                    </button>
                  </div>

                  <div className="timeline-list">
                    {group.items.map((item, index) => (
                      <div
                        className="timeline-item"
                        key={`${group.key}-${item.roomId}-${index}`}
                      >
                        <Link
                          className="timeline-main"
                          to={`/invoice/${item.blockId}/${item.roomId}`}
                        >
                          <div className="timeline-left">
                            <strong>{item.roomName}</strong>
                            <span>
                              {item.blockName} - {item.tenantName}
                            </span>
                          </div>

                          <div className="timeline-right">
                            <span className="history-debt">
                              Còn thiếu: {formatCurrency(item.debt)} đ
                            </span>
                          </div>
                        </Link>

                        <button
                          className="danger-btn small-btn"
                          onClick={() => handleDeleteOne(item)}
                        >
                          Xoá
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      {confirmState.open && (
        <div className="confirm-overlay" onClick={closeConfirm}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-badge">Xác nhận</div>
            <h3>{confirmState.title}</h3>
            <p>{confirmState.message}</p>

            <div className="confirm-actions">
              <button className="ghost-btn" onClick={closeConfirm}>
                Huỷ
              </button>
              <button
                className="danger-btn confirm-danger"
                onClick={handleConfirmOk}
              >
                Xoá
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
