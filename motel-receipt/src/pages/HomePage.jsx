import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/home.css";
import {
  formatCurrency,
  getAllInvoicesFlat,
  getInvoiceDebt,
  getLatestInvoice,
  loadData,
  saveData,
} from "../utils/storage";

function formatMoneyInput(value) {
  const raw = String(value ?? "").replace(/[^\d]/g, "");
  if (!raw) return "";
  return Number(raw).toLocaleString("vi-VN");
}

function parseMoneyInput(value) {
  return Number(String(value ?? "").replace(/[^\d]/g, "")) || 0;
}

export default function HomePage() {
  const [data, setData] = useState(() => loadData());
  const [newBlockName, setNewBlockName] = useState("");
  const [expandedBlockId, setExpandedBlockId] = useState(() => {
    const stored = loadData();
    return stored.blocks.length > 0 ? stored.blocks[0].id : null;
  });
  const [search, setSearch] = useState("");
  const [roomInputs, setRoomInputs] = useState({});
  const [openAddRoomBlockId, setOpenAddRoomBlockId] = useState(null);

  const [confirmState, setConfirmState] = useState({
    open: false,
    type: "",
    title: "",
    message: "",
    onConfirm: null,
  });

  useEffect(() => {
    saveData(data);
  }, [data]);

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

  const handleConfirmOk = () => {
    if (typeof confirmState.onConfirm === "function") {
      confirmState.onConfirm();
    }
    closeConfirm();
  };

  const handleAddBlock = () => {
    const name = newBlockName.trim();
    if (!name) return;

    const newBlock = {
      id: crypto.randomUUID(),
      name,
      rooms: [],
    };

    setData((prev) => ({
      ...prev,
      blocks: [...prev.blocks, newBlock],
    }));

    setExpandedBlockId(newBlock.id);
    setOpenAddRoomBlockId(newBlock.id);
    setNewBlockName("");
  };

  const handleDeleteBlock = (blockId) => {
    const block = data.blocks.find((item) => item.id === blockId);

    openConfirm({
      type: "danger",
      title: "Xoá dãy",
      message: `Bạn có chắc muốn xoá dãy "${
        block?.name || ""
      }" không? Toàn bộ phòng và dữ liệu phiếu trong dãy này sẽ bị xoá.`,
      onConfirm: () => {
        const remainingBlocks = data.blocks.filter(
          (block) => block.id !== blockId
        );

        setData((prev) => ({
          ...prev,
          blocks: remainingBlocks,
        }));

        if (expandedBlockId === blockId) {
          setExpandedBlockId(
            remainingBlocks.length > 0 ? remainingBlocks[0].id : null
          );
        }

        if (openAddRoomBlockId === blockId) {
          setOpenAddRoomBlockId(null);
        }
      },
    });
  };

  const handleRenameBlock = (blockId, oldName) => {
    const newName = window.prompt("Nhập tên dãy mới:", oldName);
    if (!newName || !newName.trim()) return;

    setData((prev) => ({
      ...prev,
      blocks: prev.blocks.map((block) =>
        block.id === blockId ? { ...block, name: newName.trim() } : block
      ),
    }));
  };

  const handleRoomInputChange = (blockId, field, value) => {
    let nextValue = value;

    if (field === "defaultRent" || field === "defaultTrash") {
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

  const handleAddRoom = (blockId) => {
    const values = roomInputs[blockId] || {};
    const roomName = (values.roomName || "").trim();
    const tenantName = (values.tenantName || "").trim();
    const defaultRent = parseMoneyInput(values.defaultRent || 0);
    const defaultTrash = parseMoneyInput(values.defaultTrash || 15000);

    if (!roomName || !tenantName) {
      alert("Vui lòng nhập tên phòng và tên người thuê.");
      return;
    }

    const newRoom = {
      id: crypto.randomUUID(),
      roomName,
      tenantName,
      defaultRent,
      defaultTrash,
      invoices: [],
    };

    setData((prev) => ({
      ...prev,
      blocks: prev.blocks.map((block) =>
        block.id === blockId
          ? { ...block, rooms: [...block.rooms, newRoom] }
          : block
      ),
    }));

    setRoomInputs((prev) => ({
      ...prev,
      [blockId]: {
        roomName: "",
        tenantName: "",
        defaultRent: "",
        defaultTrash: formatMoneyInput(15000),
      },
    }));

    setOpenAddRoomBlockId(null);
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
      onConfirm: () => {
        setData((prev) => ({
          ...prev,
          blocks: prev.blocks.map((block) =>
            block.id === blockId
              ? {
                  ...block,
                  rooms: block.rooms.filter((room) => room.id !== roomId),
                }
              : block
          ),
        }));
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
          const roomName = room.roomName.toLowerCase();
          const tenantName = room.tenantName.toLowerCase();
          return roomName.includes(keyword) || tenantName.includes(keyword);
        }),
      }))
      .filter(
        (block) =>
          block.rooms.length > 0 || block.name.toLowerCase().includes(keyword)
      );
  }, [data.blocks, search]);

  const recentInvoices = useMemo(() => {
    return getAllInvoicesFlat(data).slice(0, 6);
  }, [data]);

  return (
    <>
      <div className="home-page">
        <div className="home-shell">
          <header className="home-header">
            <div>
              <h1>Quản lý phòng trọ</h1>
              <p>Quản lý dãy, phòng và xem lại phiếu thu các tháng đã nhập.</p>
            </div>
          </header>

          <section className="home-toolbar card">
            <div className="toolbar-left">
              <input
                type="text"
                placeholder="Nhập tên dãy..."
                value={newBlockName}
                onChange={(e) => setNewBlockName(e.target.value)}
              />
              <button onClick={handleAddBlock}>+ Tạo dãy</button>
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

          <section className="blocks-section">
            {filteredBlocks.length === 0 ? (
              <div className="card empty-state">
                <p>Chưa có dữ liệu phù hợp.</p>
              </div>
            ) : (
              filteredBlocks.map((block) => {
                const isOpen = expandedBlockId === block.id;
                const inputs = roomInputs[block.id] || {};
                const isAddRoomOpen = openAddRoomBlockId === block.id;

                return (
                  <div className="block-card card" key={block.id}>
                    <div className="block-header">
                      <button
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
                          className="ghost-btn"
                          onClick={() =>
                            handleRenameBlock(block.id, block.name)
                          }
                        >
                          Đổi tên
                        </button>
                        <button
                          className="danger-btn"
                          onClick={() => handleDeleteBlock(block.id)}
                        >
                          Xoá dãy
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="block-content">
                        <div className="room-grid">
                          {block.rooms.map((room) => {
                            const latestInvoice = getLatestInvoice(room);
                            const latestDebt = getInvoiceDebt(latestInvoice);

                            return (
                              <div className="room-card" key={room.id}>
                                <Link
                                  className="room-main"
                                  to={`/invoice/${block.id}/${room.id}`}
                                >
                                  <h3>{room.roomName}</h3>
                                  <p>{room.tenantName}</p>
                                  <div className="room-meta">
                                    <span>
                                      Tiền phòng:{" "}
                                      {formatCurrency(room.defaultRent)} đ
                                    </span>
                                    <span
                                      className={
                                        latestDebt > 0
                                          ? "room-debt debt"
                                          : "room-debt ok"
                                      }
                                    >
                                      Tiền còn thiếu:{" "}
                                      {formatCurrency(latestDebt)} đ
                                    </span>
                                  </div>
                                </Link>

                                <div className="room-actions">
                                  <button
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

                          {!isAddRoomOpen && (
                            <button
                              type="button"
                              className="add-room-tile"
                              onClick={() => setOpenAddRoomBlockId(block.id)}
                            >
                              <span className="add-room-plus">+</span>
                              <span className="add-room-text">Thêm phòng</span>
                            </button>
                          )}

                          {isAddRoomOpen && (
                            <div className="add-room-card">
                              <div className="add-room-card-title">
                                Thêm phòng mới
                              </div>

                              <input
                                type="text"
                                placeholder="Tên phòng"
                                value={inputs.roomName || ""}
                                onChange={(e) =>
                                  handleRoomInputChange(
                                    block.id,
                                    "roomName",
                                    e.target.value
                                  )
                                }
                              />

                              <input
                                type="text"
                                placeholder="Tên người thuê"
                                value={inputs.tenantName || ""}
                                onChange={(e) =>
                                  handleRoomInputChange(
                                    block.id,
                                    "tenantName",
                                    e.target.value
                                  )
                                }
                              />

                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="Tiền phòng mặc định"
                                value={inputs.defaultRent || ""}
                                onChange={(e) =>
                                  handleRoomInputChange(
                                    block.id,
                                    "defaultRent",
                                    e.target.value
                                  )
                                }
                              />

                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="Tiền rác mặc định"
                                value={
                                  inputs.defaultTrash ?? formatMoneyInput(15000)
                                }
                                onChange={(e) =>
                                  handleRoomInputChange(
                                    block.id,
                                    "defaultTrash",
                                    e.target.value
                                  )
                                }
                              />

                              <div className="add-room-card-actions">
                                <button onClick={() => handleAddRoom(block.id)}>
                                  + Thêm phòng
                                </button>
                                <button
                                  type="button"
                                  className="ghost-btn"
                                  onClick={() => setOpenAddRoomBlockId(null)}
                                >
                                  Đóng
                                </button>
                              </div>
                            </div>
                          )}

                          {block.rooms.length === 0 && !isAddRoomOpen && (
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
                    to={`/invoice/${item.blockId}/${item.roomId}`}
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
