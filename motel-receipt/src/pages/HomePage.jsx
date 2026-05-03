import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import AccountMenu from "../components/AccountMenu";
import LoadingCard from "../components/LoadingCard";
import "../styles/home.css";
import "../styles/invoice.css";
import "../styles/loading.css";
import { getAuthUser } from "../utils/auth";
import { supabase } from "../utils/supabase";
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

const INVOICE_DRAFT_PREFIX = "motel_receipt_invoice_draft";
const DRAFT_NOTICE_KEY = "motel_receipt_invoice_draft_notice";
const LAST_OPEN_BLOCK_KEY = "motel_receipt_last_open_block";

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

function getDraftUserKey() {
  const user = getAuthUser();
  return user?.id || user?.email || "guest";
}

function getDraftMapKey(blockId, roomId) {
  return `${blockId || "no-block"}_${roomId || "no-room"}`;
}

function getInvoiceDraftPrefixForCurrentUser() {
  return `${INVOICE_DRAFT_PREFIX}_${getDraftUserKey()}_`;
}

function normalizeServerDraft(row) {
  return {
    id: row.id,
    blockId: row.block_id,
    roomId: row.room_id,
    year: row.year,
    month: row.month,
    meta: row.meta || {},
    f: row.fields || {},
    updatedAt: row.updated_at ? Date.parse(row.updated_at) : 0,
    source: "supabase",
  };
}

async function loadInvoiceDraftsFromServer() {
  const { data, error } = await supabase
    .from("invoice_drafts")
    .select("id, block_id, room_id, year, month, meta, fields, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Load invoice drafts from Supabase error:", error);
    return [];
  }

  return (data || []).map(normalizeServerDraft);
}

async function deleteDraftsForRoomFromServer(blockId, roomId) {
  const { error } = await supabase
    .from("invoice_drafts")
    .delete()
    .eq("block_id", blockId)
    .eq("room_id", roomId);

  if (error) {
    throw error;
  }
}

async function deleteDraftsForBlockFromServer(blockId) {
  const { error } = await supabase
    .from("invoice_drafts")
    .delete()
    .eq("block_id", blockId);

  if (error) {
    throw error;
  }
}

async function renameRoomOnServer(roomId, roomName) {
  const { error } = await supabase
    .from("rooms")
    .update({ room_name: roomName })
    .eq("id", roomId);

  if (error) {
    throw error;
  }
}

function loadInvoiceDraftsFromLocal() {
  const prefix = getInvoiceDraftPrefixForCurrentUser();
  const drafts = [];

  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);

      if (!key || !key.startsWith(prefix)) continue;

      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const draft = JSON.parse(raw);

      if (!draft?.blockId || !draft?.roomId || !draft?.meta || !draft?.f) {
        continue;
      }

      drafts.push({
        ...draft,
        updatedAt: Number(draft.updatedAt || 0),
        draftKey: key,
        source: "local",
      });
    }
  } catch (error) {
    console.error("Load local invoice drafts error:", error);
  }

  return drafts;
}

function buildLatestDraftMap(drafts) {
  const map = {};

  drafts.forEach((draft) => {
    const mapKey = getDraftMapKey(draft.blockId, draft.roomId);
    const current = map[mapKey];

    if (
      !current ||
      Number(draft.updatedAt || 0) > Number(current.updatedAt || 0)
    ) {
      map[mapKey] = draft;
    }
  });

  return map;
}

function removeLocalDraftsForRoom(blockId, roomId) {
  const prefix = getInvoiceDraftPrefixForCurrentUser();

  try {
    const keysToRemove = [];

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);

      if (
        key &&
        key.startsWith(prefix) &&
        key.includes(`_${blockId}_${roomId}_`)
      ) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.error("Remove local room drafts error:", error);
  }
}

function removeLocalDraftsForBlock(blockId) {
  const prefix = getInvoiceDraftPrefixForCurrentUser();

  try {
    const keysToRemove = [];

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);

      if (key && key.startsWith(prefix) && key.includes(`_${blockId}_`)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.error("Remove local block drafts error:", error);
  }
}

function removeDraftMapForRoom(map, blockId, roomId) {
  const nextMap = { ...map };
  delete nextMap[getDraftMapKey(blockId, roomId)];
  return nextMap;
}

function removeDraftMapForBlock(map, blockId) {
  const nextMap = {};

  Object.entries(map).forEach(([key, value]) => {
    if (String(value.blockId) !== String(blockId)) {
      nextMap[key] = value;
    }
  });

  return nextMap;
}

function getMoneyFromFields(room, fields) {
  const rentAmount = parseMoneyInput(fields?.rentAmount ?? room.defaultRent);
  const trashAmount = parseMoneyInput(
    fields?.trashUnit ?? room.defaultTrash ?? 15000
  );

  const elecOld = parseMoneyInput(fields?.elecOld || 0);
  const elecNew = parseMoneyInput(fields?.elecNew || 0);
  const elecUnit = parseMoneyInput(fields?.elecUnit || 3200);
  const elecUsed = clampNonNegative(elecNew - elecOld);
  const elecAmount = elecUsed * elecUnit;

  const waterOld = parseMoneyInput(fields?.waterOld || 0);
  const waterNew = parseMoneyInput(fields?.waterNew || 0);
  const waterUnit = parseMoneyInput(fields?.waterUnit || 12000);
  const waterUsed = clampNonNegative(waterNew - waterOld);
  const waterAmount = waterUsed * waterUnit;

  const previousDebt = parseMoneyInput(fields?.previousDebt || 0);
  const paid = parseMoneyInput(fields?.paid || 0);

  const otherAmount = trashAmount + elecAmount + waterAmount;
  const totalAmount = rentAmount + otherAmount + previousDebt;
  const debtAmount = clampNonNegative(totalAmount - paid);

  return {
    rentAmount,
    otherAmount,
    debtAmount,
  };
}

function getRoomCardMoney(room, latestInvoice, draft) {
  if (draft?.f) {
    return getMoneyFromFields(room, draft.f);
  }

  if (latestInvoice) {
    return getMoneyFromFields(room, latestInvoice);
  }

  return getMoneyFromFields(room, {
    rentAmount: room.defaultRent || 0,
    trashUnit: room.defaultTrash || 15000,
    paid: 0,
  });
}

export default function HomePage() {
  const location = useLocation();

  const [data, setData] = useState({ blocks: [] });
  const [draftMap, setDraftMap] = useState({});
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [pageError, setPageError] = useState("");

  const [newBlockName, setNewBlockName] = useState("");
  const [expandedBlockId, setExpandedBlockId] = useState(null);

  const [search, setSearch] = useState("");
  const [roomInputs, setRoomInputs] = useState({});
  const [openAddRoomBlockId, setOpenAddRoomBlockId] = useState(null);
  const [roomToast, setRoomToast] = useState("");
  const [draftToast, setDraftToast] = useState("");

  const draftToastRef = useRef(null);
  const draftToastTimerRef = useRef(null);
  const draftToastExitTimerRef = useRef(null);
  const draftToastOpenRafRef = useRef(null);
  const draftToastStartYRef = useRef(0);
  const draftToastDragYRef = useRef(0);
  const draftToastPointerIdRef = useRef(null);
  const draftToastStartTimeRef = useRef(0);
  const draftToastRafRef = useRef(null);

  const [draftToastDragY, setDraftToastDragY] = useState(0);
  const [isDraftToastOpen, setIsDraftToastOpen] = useState(false);
  const [isDraftToastDragging, setIsDraftToastDragging] = useState(false);
  const [isDraftToastClosing, setIsDraftToastClosing] = useState(false);

  const [renameBlockModal, setRenameBlockModal] = useState({
    open: false,
    blockId: null,
    value: "",
  });

  const [blockMenuModal, setBlockMenuModal] = useState({
    open: false,
    block: null,
  });

  const [roomManageModal, setRoomManageModal] = useState({
    open: false,
    blockId: null,
    roomId: null,
    roomName: "",
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

  function clearDraftToastTimer() {
    if (draftToastTimerRef.current) {
      clearTimeout(draftToastTimerRef.current);
      draftToastTimerRef.current = null;
    }
  }

  function clearDraftToastExitTimer() {
    if (draftToastExitTimerRef.current) {
      clearTimeout(draftToastExitTimerRef.current);
      draftToastExitTimerRef.current = null;
    }
  }

  function clearDraftToastRaf() {
    if (draftToastRafRef.current) {
      cancelAnimationFrame(draftToastRafRef.current);
      draftToastRafRef.current = null;
    }
  }

  function clearDraftToastOpenRaf() {
    if (draftToastOpenRafRef.current) {
      cancelAnimationFrame(draftToastOpenRafRef.current);
      draftToastOpenRafRef.current = null;
    }
  }

  function applyDraftToastDrag(y) {
    draftToastDragYRef.current = y;

    if (draftToastRafRef.current) return;

    draftToastRafRef.current = requestAnimationFrame(() => {
      draftToastRef.current?.style.setProperty(
        "--toast-drag-y",
        `${draftToastDragYRef.current}px`
      );

      draftToastRafRef.current = null;
    });
  }

  function resetDraftToastPosition() {
    setDraftToastDragY(0);
    draftToastDragYRef.current = 0;
    draftToastRef.current?.style.setProperty("--toast-drag-y", "0px");
  }

  function closeDraftToast(immediate = false) {
    clearDraftToastTimer();
    clearDraftToastExitTimer();
    clearDraftToastRaf();
    clearDraftToastOpenRaf();

    setIsDraftToastDragging(false);
    draftToastPointerIdRef.current = null;

    if (immediate) {
      setDraftToast("");
      setIsDraftToastOpen(false);
      setIsDraftToastClosing(false);
      resetDraftToastPosition();
      return;
    }

    setIsDraftToastOpen(false);
    setIsDraftToastClosing(true);
    resetDraftToastPosition();

    draftToastExitTimerRef.current = setTimeout(() => {
      setDraftToast("");
      setIsDraftToastOpen(false);
      setIsDraftToastClosing(false);
      resetDraftToastPosition();
    }, 380);
  }

  function handleDraftToastPointerDown(event) {
    event.preventDefault();

    clearDraftToastTimer();
    clearDraftToastExitTimer();
    clearDraftToastRaf();
    clearDraftToastOpenRaf();

    setIsDraftToastOpen(true);
    setIsDraftToastClosing(false);

    draftToastStartYRef.current = event.clientY;
    draftToastDragYRef.current = 0;
    draftToastPointerIdRef.current = event.pointerId;
    draftToastStartTimeRef.current = Date.now();

    setDraftToastDragY(0);
    setIsDraftToastDragging(true);

    draftToastRef.current?.style.setProperty("--toast-drag-y", "0px");
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleDraftToastPointerMove(event) {
    if (draftToastPointerIdRef.current !== event.pointerId) return;

    event.preventDefault();

    const deltaY = event.clientY - draftToastStartYRef.current;
    const nextY = Math.min(0, Math.max(deltaY, -150));

    applyDraftToastDrag(nextY);
  }

  function handleDraftToastPointerEnd(event) {
    if (draftToastPointerIdRef.current !== event.pointerId) return;

    event.currentTarget.releasePointerCapture?.(event.pointerId);

    const finalY = draftToastDragYRef.current;
    const elapsed = Math.max(Date.now() - draftToastStartTimeRef.current, 1);
    const velocity = finalY / elapsed;

    setIsDraftToastDragging(false);
    draftToastPointerIdRef.current = null;

    if (finalY <= -42 || velocity < -0.35) {
      closeDraftToast();
      return;
    }

    resetDraftToastPosition();
  }

  const showDraftToastFromStorage = () => {
    try {
      const raw = localStorage.getItem(DRAFT_NOTICE_KEY);

      if (!raw) return;

      setDraftToast("⚠️ Phiếu thu chưa được lưu.");

      setIsDraftToastOpen(false);
      setIsDraftToastClosing(false);
      resetDraftToastPosition();

      localStorage.removeItem(DRAFT_NOTICE_KEY);
    } catch {
      localStorage.removeItem(DRAFT_NOTICE_KEY);
    }
  };

  useEffect(() => {
    if (!draftToast) return;

    clearDraftToastOpenRaf();

    setIsDraftToastOpen(false);
    setIsDraftToastClosing(false);
    resetDraftToastPosition();

    draftToastOpenRafRef.current = requestAnimationFrame(() => {
      draftToastOpenRafRef.current = requestAnimationFrame(() => {
        setIsDraftToastOpen(true);
        draftToastOpenRafRef.current = null;
      });
    });

    return () => {
      clearDraftToastOpenRaf();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftToast]);

  const refreshData = async () => {
    setIsLoadingData(true);
    setPageError("");

    try {
      const [serverData, serverDrafts] = await Promise.all([
        loadDataFromSupabase(),
        loadInvoiceDraftsFromServer(),
      ]);

      const localDrafts = loadInvoiceDraftsFromLocal();
      const nextDraftMap = buildLatestDraftMap([
        ...serverDrafts,
        ...localDrafts,
      ]);

      setData(serverData);
      setDraftMap(nextDraftMap);

      saveData(serverData);

      const preferredBlockId =
        location.state?.openBlockId ||
        localStorage.getItem(LAST_OPEN_BLOCK_KEY);

      setExpandedBlockId((currentBlockId) => {
        const wantedBlockId = preferredBlockId || currentBlockId;

        const wantedStillExists = serverData.blocks.some(
          (block) => block.id === wantedBlockId
        );

        if (wantedStillExists) return wantedBlockId;

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
    showDraftToastFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  useEffect(() => {
    clearDraftToastTimer();

    if (
      !draftToast ||
      !isDraftToastOpen ||
      isDraftToastDragging ||
      isDraftToastClosing
    ) {
      return;
    }

    draftToastTimerRef.current = setTimeout(() => {
      closeDraftToast();
    }, 4200);

    return () => {
      clearDraftToastTimer();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftToast, isDraftToastOpen, isDraftToastDragging, isDraftToastClosing]);

  useEffect(() => {
    return () => {
      clearDraftToastTimer();
      clearDraftToastExitTimer();
      clearDraftToastRaf();
      clearDraftToastOpenRaf();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const openRoomManageModal = (blockId, room) => {
    setRoomManageModal({
      open: true,
      blockId,
      roomId: room.id,
      roomName: room.roomName || "",
    });
  };

  const closeRoomManageModal = () => {
    setRoomManageModal({
      open: false,
      blockId: null,
      roomId: null,
      roomName: "",
    });
  };

  const handleRoomNameSave = async (event) => {
    event.preventDefault();

    const nextRoomName = roomManageModal.roomName.trim();

    if (!nextRoomName) {
      showRoomToast("Vui lòng nhập tên phòng.");
      return;
    }

    try {
      await renameRoomOnServer(roomManageModal.roomId, nextRoomName);

      setData((prev) => {
        const nextData = {
          ...prev,
          blocks: prev.blocks.map((block) =>
            block.id === roomManageModal.blockId
              ? {
                  ...block,
                  rooms: block.rooms.map((room) =>
                    room.id === roomManageModal.roomId
                      ? { ...room, roomName: nextRoomName }
                      : room
                  ),
                }
              : block
          ),
        };

        saveData(nextData);
        return nextData;
      });

      setDraftMap((currentMap) => {
        const mapKey = getDraftMapKey(
          roomManageModal.blockId,
          roomManageModal.roomId
        );

        if (!currentMap[mapKey]) return currentMap;

        return {
          ...currentMap,
          [mapKey]: {
            ...currentMap[mapKey],
            meta: {
              ...(currentMap[mapKey].meta || {}),
              room: nextRoomName,
            },
          },
        };
      });

      closeRoomManageModal();
      showRoomToast("✅ Đã đổi tên phòng.");
    } catch (error) {
      console.error("Rename room error:", error);
      showRoomToast(error.message || "Không thể đổi tên phòng.");
    }
  };

  const handleRoomDeleteFromModal = () => {
    const { blockId, roomId } = roomManageModal;

    if (!blockId || !roomId) return;

    closeRoomManageModal();
    handleDeleteRoom(blockId, roomId);
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
      localStorage.setItem(LAST_OPEN_BLOCK_KEY, newBlock.id);
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
        await deleteDraftsForBlockFromServer(blockId);
        removeLocalDraftsForBlock(blockId);

        setDraftMap((currentMap) =>
          removeDraftMapForBlock(currentMap, blockId)
        );

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
        await deleteDraftsForRoomFromServer(blockId, roomId);
        removeLocalDraftsForRoom(blockId, roomId);

        setDraftMap((currentMap) =>
          removeDraftMapForRoom(currentMap, blockId, roomId)
        );

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

      {draftToast && (
        <div
          ref={draftToastRef}
          className={`draft-toast swipe-toast no-print ${
            isDraftToastOpen ? "is-open" : ""
          } ${isDraftToastDragging ? "is-dragging" : ""} ${
            isDraftToastClosing ? "is-closing" : ""
          }`}
          style={{
            "--toast-drag-y": `${draftToastDragY}px`,
          }}
          role="status"
          title="Giữ chuột/tay để đọc, kéo lên để đóng"
          onPointerDown={handleDraftToastPointerDown}
          onPointerMove={handleDraftToastPointerMove}
          onPointerUp={handleDraftToastPointerEnd}
          onPointerCancel={handleDraftToastPointerEnd}
        >
          <span className="toast-grabber" aria-hidden="true" />
          <span>{draftToast}</span>
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
            <section className="card empty-state content-fade-in">
              <p>{pageError}</p>
            </section>
          )}

          {isLoadingData ? (
            <LoadingCard
              title="Đang tải phòng trọ"
              message="Đang lấy dữ liệu dãy, phòng, phiếu và bản nháp từ Supabase..."
            />
          ) : (
            <div className="content-fade-in">
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
                            onClick={() => {
                              const nextBlockId = isOpen ? null : block.id;

                              setExpandedBlockId(nextBlockId);

                              if (nextBlockId) {
                                localStorage.setItem(
                                  LAST_OPEN_BLOCK_KEY,
                                  nextBlockId
                                );
                              } else {
                                localStorage.removeItem(LAST_OPEN_BLOCK_KEY);
                              }
                            }}
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
                                const draft =
                                  draftMap[getDraftMapKey(block.id, room.id)];

                                const latestInvoice = getLatestInvoice(room);
                                const roomMoney = getRoomCardMoney(
                                  room,
                                  latestInvoice,
                                  draft
                                );

                                const sourceYear =
                                  draft?.year || latestInvoice?.year;
                                const sourceMonth =
                                  draft?.month || latestInvoice?.month;

                                const invoiceQuery =
                                  sourceYear && sourceMonth
                                    ? `?year=${sourceYear}&month=${sourceMonth}`
                                    : "";

                                const displayRoomName =
                                  draft?.meta?.room || room.roomName;
                                const displayTenantName =
                                  draft?.meta?.tenant || room.tenantName;

                                const roomCardStatusClass = draft
                                  ? "room-card-draft"
                                  : latestInvoice
                                  ? "room-card-saved"
                                  : "";

                                return (
                                  <div
                                    className={`room-card ${roomCardStatusClass}`}
                                    key={room.id}
                                  >
                                    <div className="room-card-head room-card-head-with-edit">
                                      <Link
                                        className="room-title-link"
                                        to={`/invoice/${block.id}/${room.id}${invoiceQuery}`}
                                      >
                                        <h3>{displayRoomName}</h3>
                                      </Link>

                                      <div className="room-card-head-actions">
                                        {draft ? (
                                          <span className="room-draft-badge">
                                            Chưa lưu
                                          </span>
                                        ) : latestInvoice ? (
                                          <span className="room-saved-badge">
                                            Đã lưu
                                          </span>
                                        ) : null}

                                        <button
                                          type="button"
                                          className="room-edit-icon-btn"
                                          onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            openRoomManageModal(block.id, room);
                                          }}
                                          aria-label={`Chỉnh sửa ${displayRoomName}`}
                                          title="Chỉnh sửa phòng"
                                        >
                                          <svg
                                            viewBox="0 0 24 24"
                                            aria-hidden="true"
                                            focusable="false"
                                          >
                                            <path
                                              d="M4 20h5.2L19.1 10.1c1.2-1.2 1.2-3.1 0-4.2l-1-1c-1.2-1.2-3.1-1.2-4.2 0L4 14.8V20Z"
                                              fill="none"
                                              stroke="currentColor"
                                              strokeWidth="1.9"
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                            />
                                            <path
                                              d="M13.2 5.6l5.2 5.2"
                                              fill="none"
                                              stroke="currentColor"
                                              strokeWidth="1.9"
                                              strokeLinecap="round"
                                            />
                                          </svg>
                                        </button>
                                      </div>
                                    </div>

                                    <Link
                                      className="room-main room-main-body"
                                      to={`/invoice/${block.id}/${room.id}${invoiceQuery}`}
                                    >
                                      <p>{displayTenantName}</p>

                                      <div className="room-meta">
                                        <span>
                                          Tiền phòng:{" "}
                                          {formatCurrency(roomMoney.rentAmount)}{" "}
                                          đ
                                        </span>

                                        <span>
                                          Tiền khác:{" "}
                                          {formatCurrency(
                                            roomMoney.otherAmount
                                          )}{" "}
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
                                          {formatCurrency(roomMoney.debtAmount)}{" "}
                                          đ
                                        </span>

                                        {draft ? (
                                          <span className="room-draft-note">
                                            Đang hiển thị thông tin nháp
                                          </span>
                                        ) : latestInvoice ? (
                                          <span className="room-saved-note">
                                            Đang hiển thị thông tin đã lưu
                                          </span>
                                        ) : null}
                                      </div>
                                    </Link>
                                  </div>
                                );
                              })}

                              <button
                                type="button"
                                className="add-room-tile"
                                onClick={() => setOpenAddRoomBlockId(block.id)}
                              >
                                <span className="add-room-plus">+</span>
                                <span className="add-room-text">
                                  Thêm phòng
                                </span>
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

              <section className="history-section card content-fade-in-slow">
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
          )}
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

      {roomManageModal.open && (
        <div className="add-room-modal-overlay" onClick={closeRoomManageModal}>
          <form
            className="add-room-modal room-manage-modal"
            onSubmit={handleRoomNameSave}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="add-room-modal-header">
              <div>
                <div className="add-room-modal-badge">Quản lý phòng</div>

                <h2>Chỉnh sửa phòng</h2>
              </div>

              <button
                type="button"
                className="add-room-modal-x"
                onClick={closeRoomManageModal}
              >
                ×
              </button>
            </div>

            <div className="add-room-modal-fields">
              <input
                type="text"
                placeholder="Tên phòng"
                value={roomManageModal.roomName}
                onChange={(e) =>
                  setRoomManageModal((prev) => ({
                    ...prev,
                    roomName: e.target.value,
                  }))
                }
                autoFocus
              />
            </div>

            <div className="room-manage-actions">
              <button
                type="button"
                className="danger-btn room-manage-delete-btn"
                onClick={handleRoomDeleteFromModal}
              >
                Xoá phòng
              </button>

              <div className="room-manage-right-actions">
                <button
                  type="button"
                  className="add-room-modal-secondary"
                  onClick={closeRoomManageModal}
                >
                  Huỷ
                </button>

                <button type="submit" className="add-room-modal-primary">
                  Lưu thay đổi
                </button>
              </div>
            </div>
          </form>
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
