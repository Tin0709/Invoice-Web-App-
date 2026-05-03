import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import LoadingCard from "../components/LoadingCard";
import "../styles/history.css";
import "../styles/loading.css";
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

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M9 4H15L15.8 5.5H20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 5.5H20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M6.5 8H17.5L16.8 19C16.7 20.1 15.8 21 14.7 21H9.3C8.2 21 7.3 20.1 7.2 19L6.5 8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M10 11V17"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M14 11V17"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

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

function getPaidValue(item) {
  return parseMoneyValue(item?.paid ?? 0);
}

function getTotalValue(item) {
  const savedTotal = parseMoneyValue(
    item?.total ?? item?.finalTotal ?? item?.totalAmount ?? 0
  );

  if (savedTotal > 0) return savedTotal;

  return getPaidValue(item) + getDebtValue(item);
}

function getMonthSummary(items) {
  return items.reduce(
    (summary, item) => {
      const total = getTotalValue(item);
      const paid = getPaidValue(item);
      const debt = getDebtValue(item);

      return {
        total: summary.total + total,
        paid: summary.paid + paid,
        debt: summary.debt + debt,
        debtCount: summary.debtCount + (debt > 0 ? 1 : 0),
        paidCount: summary.paidCount + (debt === 0 ? 1 : 0),
      };
    },
    {
      total: 0,
      paid: 0,
      debt: 0,
      debtCount: 0,
      paidCount: 0,
    }
  );
}

function getBlockTone(blockName) {
  const tones = ["block-a", "block-b", "block-c", "block-d"];
  const text = normalizeText(blockName);

  const letterMatch = text.match(/day\s*([a-z])/);

  if (letterMatch?.[1]) {
    const letterIndex = letterMatch[1].charCodeAt(0) - 97;
    return tones[((letterIndex % tones.length) + tones.length) % tones.length];
  }

  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = text.charCodeAt(index) + ((hash << 5) - hash);
  }

  return tones[Math.abs(hash) % tones.length];
}

function groupInvoicesByMonth(invoices) {
  const sortedInvoices = [...invoices].sort((a, b) => {
    const yearDiff = Number(b.year) - Number(a.year);
    if (yearDiff !== 0) return yearDiff;

    const monthDiff = Number(b.month) - Number(a.month);
    if (monthDiff !== 0) return monthDiff;

    const blockDiff = String(a.blockName || "").localeCompare(
      String(b.blockName || ""),
      "vi"
    );
    if (blockDiff !== 0) return blockDiff;

    const roomDiff = String(a.roomName || "").localeCompare(
      String(b.roomName || ""),
      "vi",
      {
        numeric: true,
        sensitivity: "base",
      }
    );
    if (roomDiff !== 0) return roomDiff;

    return String(a.tenantName || "").localeCompare(
      String(b.tenantName || ""),
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
  const [openMonthKeys, setOpenMonthKeys] = useState({});
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

  useEffect(() => {
    setOpenMonthKeys((currentOpenKeys) => {
      if (grouped.length === 0) return {};

      const validOpenKeys = {};

      grouped.forEach((group) => {
        if (currentOpenKeys[group.key]) {
          validOpenKeys[group.key] = true;
        }
      });

      if (Object.keys(validOpenKeys).length > 0) {
        return validOpenKeys;
      }

      return {
        [grouped[0].key]: true,
      };
    });
  }, [grouped]);

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

  const toggleMonthGroup = (groupKey) => {
    setOpenMonthKeys((currentOpenKeys) => ({
      ...currentOpenKeys,
      [groupKey]: !currentOpenKeys[groupKey],
    }));
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
          <div className="history-topbar content-fade-in">
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
            <div className="history-empty-card content-fade-in">
              <h3>Không thể tải dữ liệu</h3>
              <p>{pageError}</p>
            </div>
          )}

          {isLoadingData ? (
            <LoadingCard
              title="Đang tải lịch sử"
              message="Đang lấy toàn bộ phiếu đã lưu từ Supabase..."
            />
          ) : (
            <div className="content-fade-in">
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
                        onChange={(event) =>
                          updateFilter("search", event.target.value)
                        }
                      />
                    </div>

                    <div className="history-filter-field">
                      <label>Tháng</label>
                      <select
                        value={filters.month}
                        onChange={(event) =>
                          updateFilter("month", event.target.value)
                        }
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
                        onChange={(event) =>
                          updateFilter("year", event.target.value)
                        }
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
                        onChange={(event) =>
                          updateFilter("blockId", event.target.value)
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
                        onChange={(event) =>
                          updateFilter("status", event.target.value)
                        }
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
                <div className="timeline-groups content-fade-in-slow">
                  {grouped.map((group) => {
                    const isGroupOpen = Boolean(openMonthKeys[group.key]);
                    const monthSummary = getMonthSummary(group.items);

                    return (
                      <section
                        className={`timeline-group ${
                          isGroupOpen ? "is-open" : "is-collapsed"
                        }`}
                        key={group.key}
                      >
                        <div className="timeline-group-header">
                          <button
                            type="button"
                            className="timeline-group-toggle"
                            onClick={() => toggleMonthGroup(group.key)}
                            aria-expanded={isGroupOpen}
                          >
                            <div className="month-header-top">
                              <div>
                                <h2>
                                  {group.month}/{group.year}
                                </h2>

                                <span>
                                  {group.items.length} phiếu •{" "}
                                  {monthSummary.debtCount} còn thiếu •{" "}
                                  {monthSummary.paidCount} đã trả đủ
                                </span>
                              </div>

                              <span
                                className="month-toggle-icon"
                                aria-hidden="true"
                              >
                                <svg viewBox="0 0 24 24" focusable="false">
                                  <path
                                    d="M6 9L12 15L18 9"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.6"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              </span>
                            </div>

                            <div className="month-summary-grid">
                              <div className="month-summary-card">
                                <span>Tổng phải thu</span>
                                <strong>
                                  {formatCurrency(monthSummary.total)} đ
                                </strong>
                              </div>

                              <div className="month-summary-card paid">
                                <span>Đã thu</span>
                                <strong>
                                  {formatCurrency(monthSummary.paid)} đ
                                </strong>
                              </div>

                              <div className="month-summary-card debt">
                                <span>Còn thiếu</span>
                                <strong>
                                  {formatCurrency(monthSummary.debt)} đ
                                </strong>
                              </div>
                            </div>
                          </button>

                          <button
                            type="button"
                            className="danger-btn history-delete-month-btn"
                            onClick={() => handleDeleteMonth(group)}
                          >
                            Xoá tháng này
                          </button>
                        </div>

                        {isGroupOpen && (
                          <div className="timeline-list">
                            {group.items.map((item, index) => {
                              const debt = getDebtValue(item);
                              const toneClass = getBlockTone(item.blockName);

                              return (
                                <article
                                  className={`timeline-item history-entry-card ${toneClass}`}
                                  key={`${group.key}-${item.roomId}-${index}`}
                                >
                                  <button
                                    type="button"
                                    className="history-entry-delete-btn"
                                    onClick={() => handleDeleteOne(item)}
                                    aria-label={`Xoá lịch sử ${item.roomName}`}
                                    title="Xoá phiếu"
                                  >
                                    <TrashIcon />
                                  </button>

                                  <Link
                                    className="timeline-main history-entry-link"
                                    to={`/invoice/${item.blockId}/${item.roomId}?year=${item.year}&month=${item.month}`}
                                  >
                                    <div className="timeline-left history-entry-main">
                                      <strong>{item.roomName}</strong>

                                      <div className="history-entry-meta">
                                        <span
                                          className={`history-block-chip ${toneClass}`}
                                        >
                                          {item.blockName}
                                        </span>

                                        <span className="history-tenant-name">
                                          {item.tenantName}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="timeline-right history-entry-right">
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
                                </article>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {confirmState.open && (
        <div className="confirm-overlay" onClick={closeConfirm}>
          <div
            className="confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
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
