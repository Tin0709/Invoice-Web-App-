import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import AccountMenu from "../components/AccountMenu";
import "../styles/home.css";
import "../styles/invoice.css";
import {
  formatCurrency,
  getAllInvoicesFlat,
  getLatestInvoice,
  saveData,
} from "../utils/storage";
import {
  createBlockOnServer,
  createRoomOnServer,
  deleteBlockOnServer,
  deleteRoomOnServer,
  loadDataFromSupabase,
  renameBlockOnServer,
} from "../utils/supabaseStorage";

function formatMoneyInput(value) {
  const raw = String(value ?? "").replace(/[^\d]/g, "");
  if (!raw) return "";
  return Number(raw).toLocaleString("vi-VN");
}

function parseMoneyInput(value) {
  return Number(String(value ?? "").replace(/[^\d]/g, "")) || 0;
}

function clampNonNegative(number) {
  return number < 0 ? 0 : number;
}

function getRoomCardMoney(room, latestInvoice) {
  const rentAmount = latestInvoice
    ? parseMoneyInput(latestInvoice.rentAmount ?? room.defaultRent)
    : Number(room.defaultRent || 0);

  const trashAmount = latestInvoice
    ? parseMoneyInput(latestInvoice.trashUnit ?? room.defaultTrash ?? 15000)
    : Number(room.defaultTrash || 15000);

  const elecOld = parseMoneyInput(latestInvoice?.elecOld || 0);
  const elecNew = parseMoneyInput(latestInvoice?.elecNew || 0);
  const elecUnit = parseMoneyInput(latestInvoice?.elecUnit || 3200);
  const elecUsed = clampNonNegative(elecNew - elecOld);
  const elecAmount = elecUsed * elecUnit;

  const waterOld = parseMoneyInput(latestInvoice?.waterOld || 0);
  const waterNew = parseMoneyInput(latestInvoice?.waterNew || 0);
  const waterUnit = parseMoneyInput(latestInvoice?.waterUnit || 12000);
  const waterUsed = clampNonNegative(waterNew - waterOld);
  const waterAmount = waterUsed * waterUnit;

  const paid = parseMoneyInput(latestInvoice?.paid || 0);

  const otherAmount = trashAmount + elecAmount + waterAmount;
  const totalAmount = rentAmount + otherAmount;
  const debtAmount = clampNonNegative(totalAmount - paid);

  return {
    rentAmount,
    otherAmount,
    debtAmount,
  };
}

export default function HomePage() {
  const location = useLocation();

  const [data, setData] = useState({ blocks: [] });
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [pageError, setPageError] = useState("");

  const [newBlockName, setNewBlockName] = useState("");
  const [expandedBlockId, setExpandedBlockId] = useState(null);

  const [search, setSearch] = useState("");
  const [roomInputs, setRoomInputs] = useState({});
  const [openAddRoomBlockId, setOpenAddRoomBlockId] = useState(null);
  const [roomToast, setRoomToast] = useState("");

  const [renameBlockModal, setRenameBlockModal] = useState({
    open: false,
    blockId: null,
    value: "",
  });

  const [blockMenuModal, setBlockMenuModal] = useState({
    open: false,
    block: null,
  });

  const [confirmState, setConfirmState] = useState({
    open: false,
    type: "",
    title: "",
    message: "",
    onConfirm: null,
  });

  const showRoomToast = (message) => {
    setRoomToast(message);

    setTimeout(() => {
      setRoomToast("");
    }, 1800);
  };

  const refreshData = async () => {
    setIsLoadingData(true);
    setPageError("");

    try {
      const serverData = await loadDataFromSupabase();

      setData(serverData);

      // Tạm thời sync xuống localStorage để các trang Invoice/History cũ vẫn đọc được.
      // Sau khi mình chuyển InvoicePage và HistoryPage sang Supabase thì có thể bỏ dòng này.
      saveData(serverData);

      setExpandedBlockId((currentBlockId) => {
        const currentStillExists = serverData.blocks.some(
          (block) => block.id === currentBlockId
        );

        if (currentStillExists) return currentBlockId;

        return serverData.blocks.length > 0 ? serverData.blocks[0].id : null;
      });
    } catch (error) {
      console.error("Load Supabase data error:", error);
      setPageError(error.message || "Không thể tải dữ liệu từ Supabase.");
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    refreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const activeAddRoomBlock = useMemo(() => {
    if (!openAddRoomBlockId) return null;
    return data.blocks.find((block) => block.id === openAddRoomBlockId) || null;
  }, [data.blocks, openAddRoomBlockId]);

  const activeInputs = openAddRoomBlockId
    ? roomInputs[openAddRoomBlockId] || {}
    : {};

  const openConfirm = ({ type, title, message, onConfirm }) => {
    setConfirmState({
      open: true,
      type,
      title,
      message,
      onConfirm,
    });
  };

  const closeConfirm = () => {
    setConfirmState({
      open: false,
      type: "",
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
      showRoomToast(error.message || "Có lỗi xảy ra.");
    } finally {
      closeConfirm();
    }
  };

  const closeAddRoomModal = () => {
    setOpenAddRoomBlockId(null);
  };

  const openRenameBlockModal = (block) => {
    setRenameBlockModal({
      open: true,
      blockId: block.id,
      value: block.name || "",
    });
  };

  const closeRenameBlockModal = () => {
    setRenameBlockModal({
      open: false,
      blockId: null,
      value: "",
    });
  };

  const openBlockMenuModal = (block) => {
    setBlockMenuModal({
      open: true,
      block,
    });
  };

  const closeBlockMenuModal = () => {
    setBlockMenuModal({
      open: false,
      block: null,
    });
  };

  const handleRenameBlockSubmit = async (event) => {
    event.preventDefault();

    const newName = renameBlockModal.value.trim();

    if (!newName) {
      showRoomToast("Vui lòng nhập tên dãy.");
      return;
    }

    try {
      await renameBlockOnServer(renameBlockModal.blockId, newName);

      setData((prev) => {
        const nextData = {
          ...prev,
          blocks: prev.blocks.map((block) =>
            block.id === renameBlockModal.blockId
              ? { ...block, name: newName }
              : block
          ),
        };

        saveData(nextData);
        return nextData;
      });

      closeRenameBlockModal();
      showRoomToast("✅ Đã đổi tên dãy.");
    } catch (error) {
      console.error(error);
      showRoomToast(error.message || "Không thể đổi tên dãy.");
    }
  };

  const handleAddBlock = async () => {
    const name = newBlockName.trim();

    if (!name) {
      showRoomToast("Vui lòng nhập tên dãy.");
      return;
    }

    try {
      const newBlock = await createBlockOnServer(name);

      setData((prev) => {
        const nextData = {
          ...prev,
          blocks: [...prev.blocks, newBlock],
        };

        saveData(nextData);
        return nextData;
      });

      setExpandedBlockId(newBlock.id);
      setOpenAddRoomBlockId(null);
      setNewBlockName("");

      showRoomToast("✅ Đã tạo dãy mới.");
    } catch (error) {
      console.error(error);
      showRoomToast(error.message || "Không thể tạo dãy mới.");
    }
  };

  const handleDeleteBlock = (blockId) => {
    const block = data.blocks.find((item) => item.id === blockId);

    openConfirm({
      type: "danger",
      title: "Xoá dãy",
      message: `Bạn có chắc muốn xoá dãy "${
        block?.name || ""
      }" không? Toàn bộ phòng và dữ liệu phiếu trong dãy này sẽ bị xoá.`,
      onConfirm: async () => {
        await deleteBlockOnServer(blockId);

        setData((prev) => {
          const nextBlocks = prev.blocks.filter(
            (block) => block.id !== blockId
          );

          const nextData = {
            ...prev,
            blocks: nextBlocks,
          };

          saveData(nextData);

          if (expandedBlockId === blockId) {
            setExpandedBlockId(nextBlocks.length > 0 ? nextBlocks[0].id : null);
          }

          return nextData;
        });

        if (openAddRoomBlockId === blockId) {
          setOpenAddRoomBlockId(null);
        }

        showRoomToast("Đã xoá dãy.");
      },
    });
  };

  const handleMenuRenameBlock = () => {
    if (!blockMenuModal.block) return;

    const selectedBlock = blockMenuModal.block;

    closeBlockMenuModal();
    openRenameBlockModal(selectedBlock);
  };

  const handleMenuDeleteBlock = () => {
    if (!blockMenuModal.block) return;

    const selectedBlockId = blockMenuModal.block.id;

    closeBlockMenuModal();
    handleDeleteBlock(selectedBlockId);
  };

  const handleRoomInputChange = (blockId, field, value) => {
    let nextValue = value;

    if (field === "defaultRent") {
      nextValue = formatMoneyInput(value);
    }

    setRoomInputs((prev) => ({
      ...prev,
      [blockId]: {
        ...prev[blockId],
        [field]: nextValue,
      },
    }));
  };

  const handleAddRoom = async (blockId) => {
    const values = roomInputs[blockId] || {};
    const roomName = (values.roomName || "").trim();
    const tenantName = (values.tenantName || "").trim();
    const defaultRent = parseMoneyInput(values.defaultRent || 0);

    if (!roomName || !tenantName) {
      showRoomToast("Vui lòng nhập tên phòng và tên người thuê.");
      return;
    }

    try {
      const newRoom = await createRoomOnServer(blockId, {
        roomName,
        tenantName,
        defaultRent,
        defaultTrash: 15000,
      });

      setData((prev) => {
        const nextData = {
          ...prev,
          blocks: prev.blocks.map((block) =>
            block.id === blockId
              ? { ...block, rooms: [...block.rooms, newRoom] }
              : block
          ),
        };

        saveData(nextData);
        return nextData;
      });

      setRoomInputs((prev) => ({
        ...prev,
        [blockId]: {
          roomName: "",
          tenantName: "",
          defaultRent: "",
        },
      }));

      setOpenAddRoomBlockId(null);
      showRoomToast("✅ Đã thêm phòng mới thành công.");
    } catch (error) {
      console.error(error);
      showRoomToast(error.message || "Không thể thêm phòng mới.");
    }
  };

  const handleAddRoomSubmit = (event) => {
    event.preventDefault();

    if (!openAddRoomBlockId) return;

    handleAddRoom(openAddRoomBlockId);
  };

  const handleDeleteRoom = (blockId, roomId) => {
    const block = data.blocks.find((item) => item.id === blockId);
    const room = block?.rooms.find((item) => item.id === roomId);

    openConfirm({
      type: "danger",
      title: "Xoá phòng",
      message: `Bạn có chắc muốn xoá phòng "${
        room?.roomName || ""
      }" không? Dữ liệu phiếu của phòng này cũng sẽ bị xoá.`,
      onConfirm: async () => {
        await deleteRoomOnServer(roomId);

        setData((prev) => {
          const nextData = {
            ...prev,
            blocks: prev.blocks.map((block) =>
              block.id === blockId
                ? {
                    ...block,
                    rooms: block.rooms.filter((room) => room.id !== roomId),
                  }
                : block
            ),
          };

          saveData(nextData);
          return nextData;
        });

        showRoomToast("Đã xoá phòng.");
      },
    });
  };

  const filteredBlocks = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return data.blocks;

    return data.blocks
      .map((block) => ({
        ...block,
        rooms: block.rooms.filter((room) => {
          const roomName = String(room.roomName || "").toLowerCase();
          const tenantName = String(room.tenantName || "").toLowerCase();

          return roomName.includes(keyword) || tenantName.includes(keyword);
        }),
      }))
      .filter(
        (block) =>
          block.rooms.length > 0 ||
          String(block.name || "")
            .toLowerCase()
            .includes(keyword)
      );
  }, [data.blocks, search]);

  const recentInvoices = useMemo(() => {
    return getAllInvoicesFlat(data).slice(0, 6);
  }, [data]);

  return (
    <>
      {roomToast && (
        <div className="save-toast no-print" role="status">
          {roomToast}
        </div>
      )}

      <div className="home-page">
        <div className="home-shell">
          <header className="home-header">
            <div>
              <h1>Quản lý phòng trọ</h1>
              <p>Quản lý dãy, phòng và xem lại phiếu thu các tháng đã nhập.</p>
            </div>

            <AccountMenu />
          </header>

          <section className="home-toolbar card">
            <div className="toolbar-left">
              <input
                type="text"
                placeholder="Nhập tên dãy..."
                value={newBlockName}
                onChange={(e) => setNewBlockName(e.target.value)}
              />

              <button type="button" onClick={handleAddBlock}>
                + Tạo dãy
              </button>
            </div>

            <div className="toolbar-right">
              <input
                type="text"
                placeholder="Tìm theo phòng hoặc người thuê..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </section>

          {pageError && (
            <section className="card empty-state">
              <p>{pageError}</p>
            </section>
          )}

          {isLoadingData ? (
            <section className="card empty-state">
              <p>Đang tải dữ liệu từ Supabase...</p>
            </section>
          ) : (
            <section className="blocks-section">
              {filteredBlocks.length === 0 ? (
                <div className="card empty-state">
                  <p>Chưa có dữ liệu phù hợp.</p>
                </div>
              ) : (
                filteredBlocks.map((block) => {
                  const isOpen = expandedBlockId === block.id;

                  return (
                    <div
                      className={`block-card card ${
                        isOpen ? "active-block-card" : ""
                      }`}
                      key={block.id}
                    >
                      <div className="block-header">
                        <button
                          type="button"
                          className="block-title-button"
                          onClick={() =>
                            setExpandedBlockId(isOpen ? null : block.id)
                          }
                        >
                          <span>{block.name}</span>
                        </button>

                        <div className="block-actions">
                          <span className="room-count">
                            {block.rooms.length} phòng
                          </span>

                          <button
                            type="button"
                            className="block-menu-btn"
                            onClick={() => openBlockMenuModal(block)}
                            aria-label={`Mở tuỳ chọn cho ${block.name}`}
                          >
                            ⋯
                          </button>
                        </div>
                      </div>

                      {isOpen && (
                        <div className="block-content">
                          <div className="room-grid">
                            {block.rooms.map((room) => {
                              const latestInvoice = getLatestInvoice(room);
                              const roomMoney = getRoomCardMoney(
                                room,
                                latestInvoice
                              );

                              const invoiceQuery = latestInvoice
                                ? `?year=${latestInvoice.year}&month=${latestInvoice.month}`
                                : "";

                              return (
                                <div className="room-card" key={room.id}>
                                  <Link
                                    className="room-main"
                                    to={`/invoice/${block.id}/${room.id}${invoiceQuery}`}
                                  >
                                    <h3>{room.roomName}</h3>
                                    <p>{room.tenantName}</p>

                                    <div className="room-meta">
                                      <span>
                                        Tiền phòng:{" "}
                                        {formatCurrency(roomMoney.rentAmount)} đ
                                      </span>

                                      <span>
                                        Tiền khác:{" "}
                                        {formatCurrency(roomMoney.otherAmount)}{" "}
                                        đ
                                      </span>

                                      <span
                                        className={
                                          roomMoney.debtAmount > 0
                                            ? "room-debt debt"
                                            : "room-debt ok"
                                        }
                                      >
                                        Tiền còn thiếu:{" "}
                                        {formatCurrency(roomMoney.debtAmount)} đ
                                      </span>
                                    </div>
                                  </Link>

                                  <div className="room-actions">
                                    <button
                                      type="button"
                                      className="danger-btn small-btn"
                                      onClick={() =>
                                        handleDeleteRoom(block.id, room.id)
                                      }
                                    >
                                      Xoá
                                    </button>
                                  </div>
                                </div>
                              );
                            })}

                            <button
                              type="button"
                              className="add-room-tile"
                              onClick={() => setOpenAddRoomBlockId(block.id)}
                            >
                              <span className="add-room-plus">+</span>
                              <span className="add-room-text">Thêm phòng</span>
                            </button>

                            {block.rooms.length === 0 && (
                              <div className="empty-room">
                                Chưa có phòng nào trong dãy này.
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </section>
          )}

          <section className="history-section card">
            <div className="history-head">
              <div className="section-title">
                <h2>Lịch sử phiếu gần đây</h2>
              </div>

              <Link className="home-history-link" to="/history">
                Xem tất cả / Quản lí lịch sử
              </Link>
            </div>

            {recentInvoices.length === 0 ? (
              <p className="history-empty">Chưa có invoice nào được lưu.</p>
            ) : (
              <div className="history-list">
                {recentInvoices.map((item, index) => (
                  <Link
                    key={`${item.blockId}-${item.roomId}-${item.month}-${item.year}-${index}`}
                    className="history-item"
                    to={`/invoice/${item.blockId}/${item.roomId}?year=${item.year}&month=${item.month}`}
                  >
                    <div>
                      <strong>
                        {item.month}/{item.year}
                      </strong>

                      <span>
                        {item.blockName} - {item.roomName}
                      </span>
                    </div>

                    <div>
                      <span>{item.tenantName}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {activeAddRoomBlock && (
        <div className="add-room-modal-overlay" onClick={closeAddRoomModal}>
          <form
            className="add-room-modal"
            onSubmit={handleAddRoomSubmit}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="add-room-modal-header">
              <div>
                <div className="add-room-modal-badge">
                  {activeAddRoomBlock.name}
                </div>

                <h2>Thêm phòng mới</h2>
              </div>

              <button
                type="button"
                className="add-room-modal-x"
                onClick={closeAddRoomModal}
              >
                ×
              </button>
            </div>

            <div className="add-room-modal-fields">
              <input
                type="text"
                placeholder="Tên phòng"
                value={activeInputs.roomName || ""}
                onChange={(e) =>
                  handleRoomInputChange(
                    openAddRoomBlockId,
                    "roomName",
                    e.target.value
                  )
                }
                autoFocus
              />

              <input
                type="text"
                placeholder="Tên người thuê"
                value={activeInputs.tenantName || ""}
                onChange={(e) =>
                  handleRoomInputChange(
                    openAddRoomBlockId,
                    "tenantName",
                    e.target.value
                  )
                }
              />

              <input
                type="text"
                inputMode="numeric"
                placeholder="Tiền phòng mặc định"
                value={activeInputs.defaultRent || ""}
                onChange={(e) =>
                  handleRoomInputChange(
                    openAddRoomBlockId,
                    "defaultRent",
                    e.target.value
                  )
                }
              />
            </div>

            <div className="add-room-modal-actions">
              <button type="submit" className="add-room-modal-primary">
                + Thêm phòng
              </button>

              <button
                type="button"
                className="add-room-modal-secondary"
                onClick={closeAddRoomModal}
              >
                Đóng
              </button>
            </div>
          </form>
        </div>
      )}

      {renameBlockModal.open && (
        <div className="add-room-modal-overlay" onClick={closeRenameBlockModal}>
          <form
            className="add-room-modal"
            onSubmit={handleRenameBlockSubmit}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="add-room-modal-header">
              <div>
                <div className="add-room-modal-badge">Đổi tên dãy</div>

                <h2>Nhập tên dãy mới</h2>
              </div>

              <button
                type="button"
                className="add-room-modal-x"
                onClick={closeRenameBlockModal}
              >
                ×
              </button>
            </div>

            <div className="add-room-modal-fields">
              <input
                type="text"
                placeholder="Tên dãy mới"
                value={renameBlockModal.value}
                onChange={(e) =>
                  setRenameBlockModal((prev) => ({
                    ...prev,
                    value: e.target.value,
                  }))
                }
                autoFocus
              />
            </div>

            <div className="add-room-modal-actions">
              <button type="submit" className="add-room-modal-primary">
                Lưu tên mới
              </button>

              <button
                type="button"
                className="add-room-modal-secondary"
                onClick={closeRenameBlockModal}
              >
                Đóng
              </button>
            </div>
          </form>
        </div>
      )}

      {blockMenuModal.open && blockMenuModal.block && (
        <div className="add-room-modal-overlay" onClick={closeBlockMenuModal}>
          <div
            className="block-menu-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="block-menu-modal-header">
              <div>
                <div className="add-room-modal-badge">Tuỳ chọn dãy</div>

                <h2>{blockMenuModal.block.name}</h2>
              </div>

              <button
                type="button"
                className="add-room-modal-x"
                onClick={closeBlockMenuModal}
              >
                ×
              </button>
            </div>

            <div className="block-menu-actions">
              <button
                type="button"
                className="block-menu-action"
                onClick={handleMenuRenameBlock}
              >
                <span>✏️</span>

                <div>
                  <strong>Đổi tên dãy</strong>
                  <p>Chỉnh lại tên dãy này.</p>
                </div>
              </button>

              <button
                type="button"
                className="block-menu-action danger"
                onClick={handleMenuDeleteBlock}
              >
                <span>🗑️</span>

                <div>
                  <strong>Xoá dãy</strong>
                  <p>Xoá dãy này cùng toàn bộ phòng bên trong.</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

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
