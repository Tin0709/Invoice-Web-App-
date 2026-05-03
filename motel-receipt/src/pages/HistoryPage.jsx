import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/history.css";
import { formatCurrency, getAllInvoicesFlat, saveData } from "../utils/storage";
import {
  deleteInvoiceOnServer,
  deleteInvoicesByMonthOnServer,
  loadDataFromSupabase,
} from "../utils/supabaseStorage";

const DEFAULT_FILTERS = {
  search: "",
  month: "all",
  year: "all",
  blockId: "all",
  status: "all",
};

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseMoneyValue(value) {
  return Number(String(value ?? "").replace(/[^\d]/g, "")) || 0;
}

function getDebtValue(item) {
  return parseMoneyValue(
    item?.debt ??
      item?.remaining ??
      item?.remainingAmount ??
      item?.debtAmount ??
      0
  );
}

function groupInvoicesByMonth(invoices) {
  const sortedInvoices = [...invoices].sort((a, b) => {
    const yearDiff = Number(b.year) - Number(a.year);
    if (yearDiff !== 0) return yearDiff;

    const monthDiff = Number(b.month) - Number(a.month);
    if (monthDiff !== 0) return monthDiff;

    return String(a.roomName || "").localeCompare(
      String(b.roomName || ""),
      "vi"
    );
  });

  const map = new Map();

  sortedInvoices.forEach((item) => {
    const key = `${Number(item.month)}/${Number(item.year)}`;

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
  const [data, setData] = useState({ blocks: [] });
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [pageError, setPageError] = useState("");

  const [confirmState, setConfirmState] = useState({
    open: false,
    title: "",
    message: "",
    onConfirm: null,
  });

  const refreshData = async () => {
    setIsLoadingData(true);
    setPageError("");

    try {
      const serverData = await loadDataFromSupabase();

      setData(serverData);

      // Giữ cache local để Invoice.jsx đọc số cũ/tháng trước ổn định.
      saveData(serverData);
    } catch (error) {
      console.error("Load history data error:", error);
      setPageError(error.message || "Không thể tải lịch sử từ Supabase.");
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const invoices = useMemo(() => getAllInvoicesFlat(data), [data]);

  const yearOptions = useMemo(() => {
    const years = new Set();

    invoices.forEach((item) => {
      if (item.year) years.add(Number(item.year));
    });

    return Array.from(years).sort((a, b) => b - a);
  }, [invoices]);

  const blockOptions = useMemo(() => {
    const map = new Map();

    data.blocks?.forEach((block) => {
      map.set(block.id, block.name);
    });

    invoices.forEach((item) => {
      if (item.blockId && item.blockName) {
        map.set(item.blockId, item.blockName);
      }
    });

    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "vi"));
  }, [data.blocks, invoices]);

  const filteredInvoices = useMemo(() => {
    const keyword = normalizeText(filters.search.trim());

    return invoices.filter((item) => {
      const haystack = normalizeText(
        [
          item.roomName,
          item.tenantName,
          item.blockName,
          `${item.month}/${item.year}`,
        ]
          .filter(Boolean)
          .join(" ")
      );

      const matchSearch = !keyword || haystack.includes(keyword);

      const matchMonth =
        filters.month === "all" || Number(item.month) === Number(filters.month);

      const matchYear =
        filters.year === "all" || Number(item.year) === Number(filters.year);

      const matchBlock =
        filters.blockId === "all" || item.blockId === filters.blockId;

      const debt = getDebtValue(item);

      const matchStatus =
        filters.status === "all" ||
        (filters.status === "debt" && debt > 0) ||
        (filters.status === "paid" && debt === 0);

      return (
        matchSearch && matchMonth && matchYear && matchBlock && matchStatus
      );
    });
  }, [invoices, filters]);

  const grouped = useMemo(
    () => groupInvoicesByMonth(filteredInvoices),
    [filteredInvoices]
  );

  const hasActiveFilters =
    filters.search.trim() ||
    filters.month !== "all" ||
    filters.year !== "all" ||
    filters.blockId !== "all" ||
    filters.status !== "all";

  const updateFilter = (field, value) => {
    setFilters((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

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

  const handleConfirmOk = async () => {
    try {
      if (typeof confirmState.onConfirm === "function") {
        await confirmState.onConfirm();
      }
    } catch (error) {
      console.error(error);
      setPageError(error.message || "Không thể xoá lịch sử.");
    } finally {
      closeConfirm();
    }
  };

  const handleDeleteOne = (item) => {
    openConfirm({
      title: "Xoá lịch sử",
      message: `Bạn có chắc muốn xoá lịch sử ${item.roomName} - ${item.month}/${item.year} không?`,
      onConfirm: async () => {
        await deleteInvoiceOnServer(item.roomId, item.year, item.month);
        await refreshData();
      },
    });
  };

  const handleDeleteMonth = (group) => {
    openConfirm({
      title: "Xoá lịch sử theo tháng",
      message: `Bạn có chắc muốn xoá toàn bộ lịch sử của tháng ${group.month}/${group.year} không?`,
      onConfirm: async () => {
        await deleteInvoicesByMonthOnServer(group.year, group.month);
        await refreshData();
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

          {pageError && (
            <div className="history-empty-card">
              <h3>Không thể tải dữ liệu</h3>
              <p>{pageError}</p>
            </div>
          )}

          {isLoadingData ? (
            <div className="history-empty-card">
              <h3>Đang tải lịch sử</h3>
              <p>Đang lấy dữ liệu từ Supabase...</p>
            </div>
          ) : (
            <>
              {invoices.length > 0 && (
                <section className="history-filter-card">
                  <div className="history-filter-head">
                    <div>
                      <h2>Bộ lọc lịch sử</h2>

                      <p>
                        Đang hiển thị {filteredInvoices.length}/
                        {invoices.length} phiếu.
                      </p>
                    </div>

                    {hasActiveFilters && (
                      <button
                        type="button"
                        className="history-clear-filter-btn"
                        onClick={resetFilters}
                      >
                        Xoá bộ lọc
                      </button>
                    )}
                  </div>

                  <div className="history-filter-grid">
                    <div className="history-filter-field history-search-field">
                      <label>Tìm kiếm</label>

                      <input
                        type="text"
                        placeholder="Tìm phòng, người thuê, dãy..."
                        value={filters.search}
                        onChange={(e) => updateFilter("search", e.target.value)}
                      />
                    </div>

                    <div className="history-filter-field">
                      <label>Tháng</label>

                      <select
                        value={filters.month}
                        onChange={(e) => updateFilter("month", e.target.value)}
                      >
                        <option value="all">Tất cả</option>
                        {Array.from(
                          { length: 12 },
                          (_, index) => index + 1
                        ).map((month) => (
                          <option key={month} value={month}>
                            Tháng {month}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="history-filter-field">
                      <label>Năm</label>

                      <select
                        value={filters.year}
                        onChange={(e) => updateFilter("year", e.target.value)}
                      >
                        <option value="all">Tất cả</option>
                        {yearOptions.map((year) => (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="history-filter-field">
                      <label>Dãy</label>

                      <select
                        value={filters.blockId}
                        onChange={(e) =>
                          updateFilter("blockId", e.target.value)
                        }
                      >
                        <option value="all">Tất cả</option>
                        {blockOptions.map((block) => (
                          <option key={block.id} value={block.id}>
                            {block.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="history-filter-field">
                      <label>Trạng thái</label>

                      <select
                        value={filters.status}
                        onChange={(e) => updateFilter("status", e.target.value)}
                      >
                        <option value="all">Tất cả</option>
                        <option value="debt">Còn thiếu</option>
                        <option value="paid">Đã trả đủ</option>
                      </select>
                    </div>
                  </div>
                </section>
              )}

              {invoices.length === 0 ? (
                <div className="history-empty-card">
                  <h3>Chưa có lịch sử nào</h3>
                  <p>Khi bạn lưu invoice, lịch sử sẽ xuất hiện ở đây.</p>
                </div>
              ) : grouped.length === 0 ? (
                <div className="history-empty-card">
                  <h3>Không tìm thấy phiếu phù hợp</h3>
                  <p>Thử xoá bộ lọc hoặc nhập từ khoá khác.</p>
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
                          type="button"
                          className="danger-btn"
                          onClick={() => handleDeleteMonth(group)}
                        >
                          Xoá tháng này
                        </button>
                      </div>

                      <div className="timeline-list">
                        {group.items.map((item, index) => {
                          const debt = getDebtValue(item);

                          return (
                            <div
                              className="timeline-item"
                              key={`${group.key}-${item.roomId}-${index}`}
                            >
                              <Link
                                className="timeline-main"
                                to={`/invoice/${item.blockId}/${item.roomId}?year=${item.year}&month=${item.month}`}
                              >
                                <div className="timeline-left">
                                  <strong>{item.roomName}</strong>

                                  <span>
                                    {item.blockName} - {item.tenantName}
                                  </span>
                                </div>

                                <div className="timeline-right">
                                  <span
                                    className={
                                      debt > 0
                                        ? "history-debt"
                                        : "history-debt history-paid"
                                    }
                                  >
                                    Còn thiếu: {formatCurrency(debt)} đ
                                  </span>
                                </div>
                              </Link>

                              <button
                                type="button"
                                className="danger-btn small-btn"
                                onClick={() => handleDeleteOne(item)}
                              >
                                Xoá
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </>
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
              <button
                type="button"
                className="ghost-btn"
                onClick={closeConfirm}
              >
                Huỷ
              </button>

              <button
                type="button"
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
