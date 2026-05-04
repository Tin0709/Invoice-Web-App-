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
  renameRoomOnServer,
} from "../utils/supabaseStorage";

const INVOICE_DRAFT_PREFIX = "motel_receipt_invoice_draft";
const DRAFT_NOTICE_KEY = "motel_receipt_invoice_draft_notice";
const HOME_LAST_ACTIVE_BLOCK_KEY = "motel_receipt_home_last_active_block";

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

function normalizeBlockText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getBlockTone(blockName) {
  const tones = ["block-a", "block-b", "block-c", "block-d"];
  const text = normalizeBlockText(blockName);

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

function rememberActiveBlock(blockId) {
  if (!blockId) return;

  try {
    localStorage.setItem(HOME_LAST_ACTIVE_BLOCK_KEY, String(blockId));
  } catch (error) {
    console.error("Remember active block error:", error);
  }
}

function getRememberedActiveBlock() {
  try {
    return localStorage.getItem(HOME_LAST_ACTIVE_BLOCK_KEY);
  } catch {
    return null;
  }
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

function getRoomSortName(room) {
  return String(room?.roomName || "").trim();
}

function sortRoomsByName(rooms) {
  return [...(rooms || [])].sort((roomA, roomB) =>
    getRoomSortName(roomA).localeCompare(getRoomSortName(roomB), "vi", {
      numeric: true,
      sensitivity: "base",
    })
  );
}

function renderConfirmMessage(message) {
  const text = String(message || "");
  const parts = text.split(/("[^"]+")/g);

  return parts.map((part, index) => {
    const isQuoted = part.startsWith('"') && part.endsWith('"');

    if (!isQuoted) return part;

    return <strong key={`${part}-${index}`}>{part.slice(1, -1)}</strong>;
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
  const [isAddRoomSaving, setIsAddRoomSaving] = useState(false);
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
    blockName: "",
    roomId: null,
    value: "",
    roomName: "",
  });

  const [isRoomManageSaving, setIsRoomManageSaving] = useState(false);

  const [confirmState, setConfirmState] = useState({
    open: false,
    type: "",
    title: "",
    message: "",
    onConfirm: null,
  });

  const [isConfirmLoading, setIsConfirmLoading] = useState(false);

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

      const notice = JSON.parse(raw);

      setDraftToast(
        notice?.message ||
          "⚠️ Phiếu thu chưa được lưu. Mình đã giữ lại dưới dạng bản nháp."
      );

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

    /// eslint-disable-next-line react-hooks/exhaustive-deps
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

      setExpandedBlockId((currentBlockId) => {
        const rememberedBlockId =
          location.state?.activeBlockId || getRememberedActiveBlock();

        const rememberedStillExists = serverData.blocks.some(
          (block) => block.id === rememberedBlockId
        );

        if (rememberedStillExists) return rememberedBlockId;

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
    /// eslint-disable-next-line react-hooks/exhaustive-deps
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

  const resetConfirmState = () => {
    setConfirmState({
      open: false,
      type: "",
      title: "",
      message: "",
      onConfirm: null,
    });
  };

  const closeConfirm = () => {
    if (isConfirmLoading) return;
    resetConfirmState();
  };

  const handleConfirmOk = async () => {
    if (isConfirmLoading) return;

    setIsConfirmLoading(true);

    try {
      if (typeof confirmState.onConfirm === "function") {
        await confirmState.onConfirm();
      }

      resetConfirmState();
    } catch (error) {
      console.error(error);
      showRoomToast(error.message || "Có lỗi xảy ra.");
    } finally {
      setIsConfirmLoading(false);
    }
  };

  const closeAddRoomModal = (options = {}) => {
    if (isAddRoomSaving && !options.force) return;
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

  const openRoomManageModal = (block, room) => {
    rememberActiveBlock(block.id);
    setExpandedBlockId(block.id);

    setRoomManageModal({
      open: true,
      blockId: block.id,
      blockName: block.name || "",
      roomId: room.id,
      value: room.roomName || "",
      roomName: room.roomName || "",
    });
  };

  const closeRoomManageModal = (options = {}) => {
    if (isRoomManageSaving && !options.force) return;

    setRoomManageModal({
      open: false,
      blockId: null,
      blockName: "",
      roomId: null,
      value: "",
      roomName: "",
    });
  };

  const handleRoomManageSubmit = async (event) => {
    event.preventDefault();

    if (isRoomManageSaving) return;

    const newName = roomManageModal.value.trim();

    if (!newName) {
      showRoomToast("Vui lòng nhập tên phòng.");
      return;
    }

    setIsRoomManageSaving(true);

    try {
      await Promise.all([
        renameRoomOnServer(roomManageModal.roomId, newName),
        new Promise((resolve) => setTimeout(resolve, 450)),
      ]);

      setData((prev) => {
        const nextData = {
          ...prev,
          blocks: prev.blocks.map((block) =>
            block.id === roomManageModal.blockId
              ? {
                  ...block,
                  rooms: block.rooms.map((room) =>
                    room.id === roomManageModal.roomId
                      ? { ...room, roomName: newName }
                      : room
                  ),
                }
              : block
          ),
        };

        saveData(nextData);
        return nextData;
      });

      rememberActiveBlock(roomManageModal.blockId);
      setExpandedBlockId(roomManageModal.blockId);
      closeRoomManageModal({ force: true });
      showRoomToast("✅ Đã đổi tên phòng.");
    } catch (error) {
      console.error(error);
      showRoomToast(error.message || "Không thể đổi tên phòng.");
    } finally {
      setIsRoomManageSaving(false);
    }
  };

  const handleRoomManageDelete = () => {
    if (isRoomManageSaving) return;

    const { blockId, roomId } = roomManageModal;

    rememberActiveBlock(blockId);
    setExpandedBlockId(blockId);
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
    if (isAddRoomSaving) return;

    const values = roomInputs[blockId] || {};
    const roomName = (values.roomName || "").trim();
    const tenantName = (values.tenantName || "").trim();
    const defaultRent = parseMoneyInput(values.defaultRent || 0);

    if (!roomName || !tenantName) {
      showRoomToast("Vui lòng nhập tên phòng và tên người thuê.");
      return;
    }

    setIsAddRoomSaving(true);

    try {
      const [newRoom] = await Promise.all([
        createRoomOnServer(blockId, {
          roomName,
          tenantName,
          defaultRent,
          defaultTrash: 15000,
        }),
        new Promise((resolve) => setTimeout(resolve, 450)),
      ]);

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

      closeAddRoomModal({ force: true });
      showRoomToast("✅ Đã thêm phòng mới thành công.");
    } catch (error) {
      console.error(error);
      showRoomToast(error.message || "Không thể thêm phòng mới.");
    } finally {
      setIsAddRoomSaving(false);
    }
  };

  const handleAddRoomSubmit = (event) => {
    event.preventDefault();

    if (!openAddRoomBlockId || isAddRoomSaving) return;

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

        rememberActiveBlock(blockId);
        setExpandedBlockId(blockId);
        closeRoomManageModal();
        showRoomToast("Đã xoá phòng.");
      },
    });
  };

  const filteredBlocks = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) {
      return data.blocks.map((block) => ({
        ...block,
        rooms: sortRoomsByName(block.rooms),
      }));
    }

    return data.blocks
      .map((block) => ({
        ...block,
        rooms: sortRoomsByName(
          block.rooms.filter((room) => {
            const roomName = String(room.roomName || "").toLowerCase();
            const tenantName = String(room.tenantName || "").toLowerCase();

            return roomName.includes(keyword) || tenantName.includes(keyword);
          })
        ),
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
                onChange={(event) => setNewBlockName(event.target.value)}
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
                onChange={(event) => setSearch(event.target.value)}
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
                    const blockToneClass = getBlockTone(block.name);

                    return (
                      <div
                        className={`block-card card ${blockToneClass} ${
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
                                    className={`room-card ${roomCardStatusClass} ${blockToneClass}`}
                                    key={room.id}
                                  >
                                    <div className="room-card-top">
                                      <Link
                                        className="room-title-area"
                                        to={`/invoice/${block.id}/${room.id}${invoiceQuery}`}
                                        state={{ activeBlockId: block.id }}
                                        onClick={() =>
                                          rememberActiveBlock(block.id)
                                        }
                                      >
                                        <h3>{displayRoomName}</h3>
                                      </Link>

                                      <div className="room-card-actions-compact">
                                        {draft ? (
                                          <span className="room-draft-badge">
                                            Bản nháp
                                          </span>
                                        ) : latestInvoice ? (
                                          <span className="room-saved-badge">
                                            Đã lưu
                                          </span>
                                        ) : null}

                                        <button
                                          type="button"
                                          className="room-edit-btn"
                                          onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            openRoomManageModal(block, room);
                                          }}
                                          aria-label={`Chỉnh sửa ${displayRoomName}`}
                                        >
                                          <svg
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2.2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            aria-hidden="true"
                                          >
                                            <path d="M12 20h9" />
                                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                                          </svg>
                                        </button>
                                      </div>
                                    </div>

                                    <Link
                                      className="room-main room-card-click-area"
                                      to={`/invoice/${block.id}/${room.id}${invoiceQuery}`}
                                      state={{ activeBlockId: block.id }}
                                      onClick={() =>
                                        rememberActiveBlock(block.id)
                                      }
                                    >
                                      <div className="room-person-row">
                                        <span
                                          className={`room-block-chip ${blockToneClass}`}
                                        >
                                          {block.name}
                                        </span>

                                        <p>{displayTenantName}</p>
                                      </div>

                                      <div className="room-money-list">
                                        <div className="room-money-row">
                                          <span>Tiền phòng</span>
                                          <strong>
                                            {formatCurrency(
                                              roomMoney.rentAmount
                                            )}{" "}
                                            đ
                                          </strong>
                                        </div>

                                        <div className="room-money-row">
                                          <span>Tiền khác</span>
                                          <strong>
                                            {formatCurrency(
                                              roomMoney.otherAmount
                                            )}{" "}
                                            đ
                                          </strong>
                                        </div>

                                        <div
                                          className={`room-money-row room-debt-row ${
                                            roomMoney.debtAmount > 0
                                              ? "debt"
                                              : "ok"
                                          }`}
                                        >
                                          <span>Tiền còn thiếu</span>
                                          <strong>
                                            {formatCurrency(
                                              roomMoney.debtAmount
                                            )}{" "}
                                            đ
                                          </strong>
                                        </div>
                                      </div>

                                      {draft ? (
                                        <div className="room-note-pill draft">
                                          Đang hiển thị thông tin nháp
                                        </div>
                                      ) : latestInvoice ? (
                                        <div className="room-note-pill saved">
                                          Đang hiển thị thông tin đã lưu
                                        </div>
                                      ) : null}
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
                    {recentInvoices.map((item, index) => {
                      const toneClass = getBlockTone(item.blockName);

                      return (
                        <Link
                          key={`${item.blockId}-${item.roomId}-${item.month}-${item.year}-${index}`}
                          className={`history-item home-history-item ${toneClass}`}
                          to={`/invoice/${item.blockId}/${item.roomId}?year=${item.year}&month=${item.month}`}
                          state={{ activeBlockId: item.blockId }}
                          onClick={() => rememberActiveBlock(item.blockId)}
                        >
                          <div className="home-history-main">
                            <strong>
                              {item.month}/{item.year}
                            </strong>

                            <div className="home-history-meta">
                              <span
                                className={`home-history-chip ${toneClass}`}
                              >
                                {item.blockName}
                              </span>

                              <span className="home-history-room">
                                {item.roomName}
                              </span>
                            </div>
                          </div>

                          <div className="home-history-tenant">
                            {item.tenantName}
                          </div>
                        </Link>
                      );
                    })}
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
            className={`add-room-modal ${isAddRoomSaving ? "is-saving" : ""}`}
            onSubmit={handleAddRoomSubmit}
            onClick={(event) => event.stopPropagation()}
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
                disabled={isAddRoomSaving}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>

            <div className="add-room-modal-fields">
              <input
                type="text"
                placeholder="Tên phòng"
                value={activeInputs.roomName || ""}
                onChange={(event) =>
                  handleRoomInputChange(
                    openAddRoomBlockId,
                    "roomName",
                    event.target.value
                  )
                }
                autoFocus
                disabled={isAddRoomSaving}
              />

              <input
                type="text"
                placeholder="Tên người thuê"
                value={activeInputs.tenantName || ""}
                onChange={(event) =>
                  handleRoomInputChange(
                    openAddRoomBlockId,
                    "tenantName",
                    event.target.value
                  )
                }
                disabled={isAddRoomSaving}
              />

              <input
                type="text"
                inputMode="numeric"
                placeholder="Tiền phòng mặc định"
                value={activeInputs.defaultRent || ""}
                onChange={(event) =>
                  handleRoomInputChange(
                    openAddRoomBlockId,
                    "defaultRent",
                    event.target.value
                  )
                }
                disabled={isAddRoomSaving}
              />
            </div>

            <div className="add-room-modal-actions">
              <button
                type="submit"
                className={`add-room-modal-primary ${
                  isAddRoomSaving ? "is-loading" : ""
                }`}
                disabled={isAddRoomSaving}
              >
                {isAddRoomSaving ? (
                  <>
                    <span className="add-room-spinner" aria-hidden="true" />
                    Đang thêm...
                  </>
                ) : (
                  "+ Thêm phòng"
                )}
              </button>

              <button
                type="button"
                className="add-room-modal-secondary"
                onClick={closeAddRoomModal}
                disabled={isAddRoomSaving}
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
            onClick={(event) => event.stopPropagation()}
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
                onChange={(event) =>
                  setRenameBlockModal((prev) => ({
                    ...prev,
                    value: event.target.value,
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

      {roomManageModal.open && (
        <div className="add-room-modal-overlay" onClick={closeRoomManageModal}>
          <form
            className={`add-room-modal room-manage-modal-new ${
              isRoomManageSaving ? "is-saving" : ""
            }`}
            onSubmit={handleRoomManageSubmit}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="room-manage-delete-icon-btn"
              onClick={handleRoomManageDelete}
              aria-label="Xoá phòng"
              title="Xoá phòng"
              disabled={isRoomManageSaving}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v5" />
                <path d="M14 11v5" />
              </svg>
            </button>

            <button
              type="button"
              className="add-room-modal-x"
              onClick={closeRoomManageModal}
              aria-label="Đóng"
              disabled={isRoomManageSaving}
            >
              ×
            </button>

            <div className="room-manage-top">
              <div className="room-manage-badge">Tuỳ chọn phòng</div>

              <h2>{roomManageModal.roomName || "Phòng"}</h2>

              <p className="room-manage-subtitle">
                Thuộc dãy <strong>{roomManageModal.blockName || ""}</strong>
              </p>
            </div>

            <div className="room-manage-panel">
              <label className="room-manage-label" htmlFor="room-manage-name">
                Tên phòng
              </label>

              <input
                id="room-manage-name"
                type="text"
                placeholder="Nhập tên phòng mới"
                value={roomManageModal.value}
                onChange={(event) =>
                  setRoomManageModal((prev) => ({
                    ...prev,
                    value: event.target.value,
                  }))
                }
                autoFocus
                disabled={isRoomManageSaving}
              />

              <p className="room-manage-help">
                Bạn có thể đổi tên phòng để dễ quản lý hơn.
              </p>
            </div>

            <div className="room-manage-actions-new">
              <button
                type="submit"
                className={`room-manage-save-btn ${
                  isRoomManageSaving ? "is-loading" : ""
                }`}
                disabled={isRoomManageSaving}
              >
                {isRoomManageSaving ? (
                  <>
                    <span className="room-manage-spinner" aria-hidden="true" />
                    Đang lưu...
                  </>
                ) : (
                  "Lưu tên mới"
                )}
              </button>

              <button
                type="button"
                className="room-manage-close-btn"
                onClick={closeRoomManageModal}
                disabled={isRoomManageSaving}
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
            onClick={(event) => event.stopPropagation()}
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
                <span className="block-action-icon edit-icon">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                  </svg>
                </span>

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
                <span className="block-action-icon delete-icon">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v5" />
                    <path d="M14 11v5" />
                  </svg>
                </span>

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
          <div
            className="confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>{confirmState.title}</h3>
            <p>{renderConfirmMessage(confirmState.message)}</p>

            <div className="confirm-actions">
              <button
                type="button"
                className="confirm-cancel-btn"
                onClick={closeConfirm}
                disabled={isConfirmLoading}
              >
                Huỷ
              </button>

              <button
                type="button"
                className={`confirm-delete-btn ${
                  isConfirmLoading ? "is-loading" : ""
                }`}
                onClick={handleConfirmOk}
                disabled={isConfirmLoading}
              >
                {isConfirmLoading ? (
                  <>
                    <span className="confirm-spinner" aria-hidden="true" />
                    Đang xoá...
                  </>
                ) : (
                  "Xoá"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
