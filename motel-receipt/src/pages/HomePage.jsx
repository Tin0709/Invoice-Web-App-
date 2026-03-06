import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/home.css";
import {
  loadData,
  saveData,
  formatCurrency,
  sortInvoicesDesc,
} from "../utils/storage";

export default function HomePage() {
  const [data, setData] = useState(() => loadData());
  const [newBlockName, setNewBlockName] = useState("");
  const [expandedBlockId, setExpandedBlockId] = useState(() => {
    const stored = loadData();
    return stored.blocks.length > 0 ? stored.blocks[0].id : null;
  });
  const [search, setSearch] = useState("");
  const [roomInputs, setRoomInputs] = useState({});

  useEffect(() => {
    saveData(data);
  }, [data]);

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
    setNewBlockName("");
  };

  const handleDeleteBlock = (blockId) => {
    const ok = window.confirm("Bạn có chắc muốn xoá dãy này không?");
    if (!ok) return;

    const remainingBlocks = data.blocks.filter((block) => block.id !== blockId);

    setData((prev) => ({
      ...prev,
      blocks: remainingBlocks,
    }));

    if (expandedBlockId === blockId) {
      setExpandedBlockId(
        remainingBlocks.length > 0 ? remainingBlocks[0].id : null
      );
    }
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
    setRoomInputs((prev) => ({
      ...prev,
      [blockId]: {
        ...prev[blockId],
        [field]: value,
      },
    }));
  };

  const handleAddRoom = (blockId) => {
    const values = roomInputs[blockId] || {};
    const roomName = (values.roomName || "").trim();
    const tenantName = (values.tenantName || "").trim();
    const defaultRent = Number(values.defaultRent || 0);
    const defaultTrash = Number(values.defaultTrash || 15000);

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
        defaultTrash: 15000,
      },
    }));
  };

  const handleDeleteRoom = (blockId, roomId) => {
    const ok = window.confirm("Bạn có chắc muốn xoá phòng này không?");
    if (!ok) return;

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
    const all = [];

    data.blocks.forEach((block) => {
      block.rooms.forEach((room) => {
        room.invoices.forEach((invoice) => {
          all.push({
            ...invoice,
            blockId: block.id,
            roomId: room.id,
            blockName: block.name,
            roomName: room.roomName,
            tenantName: room.tenantName,
          });
        });
      });
    });

    return sortInvoicesDesc(all).slice(0, 12);
  }, [data]);

  return (
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
                      <span className="room-count">
                        {block.rooms.length} phòng
                      </span>
                    </button>

                    <div className="block-actions">
                      <button
                        className="ghost-btn"
                        onClick={() => handleRenameBlock(block.id, block.name)}
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
                      <div className="add-room-form">
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
                          type="number"
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
                          type="number"
                          placeholder="Tiền rác mặc định"
                          value={inputs.defaultTrash ?? 15000}
                          onChange={(e) =>
                            handleRoomInputChange(
                              block.id,
                              "defaultTrash",
                              e.target.value
                            )
                          }
                        />
                        <button onClick={() => handleAddRoom(block.id)}>
                          + Thêm phòng
                        </button>
                      </div>

                      <div className="room-grid">
                        {block.rooms.length === 0 ? (
                          <div className="empty-room">
                            Chưa có phòng nào trong dãy này.
                          </div>
                        ) : (
                          block.rooms.map((room) => (
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
                                  <span>
                                    Rác: {formatCurrency(room.defaultTrash)} đ
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
                          ))
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
          <div className="section-title">
            <h2>Lịch sử phiếu gần đây</h2>
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
  );
}
