import { createId } from "./storage";
import { supabase } from "./supabase";

const EMPTY_DATA = {
  blocks: [],
};

function parseMoneyLike(value) {
  return Number(String(value ?? "").replace(/[^\d]/g, "")) || 0;
}

function normalizeTextValue(value) {
  return String(value ?? "");
}

function calculateInvoiceTotals(invoice) {
  const rent = parseMoneyLike(invoice.rentAmount);
  const trash = parseMoneyLike(invoice.trashUnit);

  const elecOld = parseMoneyLike(invoice.elecOld);
  const elecNew = parseMoneyLike(invoice.elecNew);
  const elecUnit = parseMoneyLike(invoice.elecUnit);

  const waterOld = parseMoneyLike(invoice.waterOld);
  const waterNew = parseMoneyLike(invoice.waterNew);
  const waterUnit = parseMoneyLike(invoice.waterUnit);

  const previousDebt = parseMoneyLike(invoice.previousDebt);
  const paid = parseMoneyLike(invoice.paid);

  const elecUsed = Math.max(0, elecNew - elecOld);
  const waterUsed = Math.max(0, waterNew - waterOld);

  const currentMonthTotal =
    rent + trash + elecUsed * elecUnit + waterUsed * waterUnit;

  const total = currentMonthTotal + previousDebt;
  const debt = Math.max(0, total - paid);

  return {
    currentMonthTotal,
    total,
    debt,
  };
}

async function requireUser() {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  const user = data?.user;

  if (!user) {
    throw new Error("Bạn cần đăng nhập trước khi lưu dữ liệu.");
  }

  return user;
}

function invoiceFromDb(row) {
  return {
    id: row.id,
    year: row.year,
    month: row.month,

    roomName: row.room_name || "",
    tenantName: row.tenant_name || "",
    date: row.date || "",

    rentAmount: row.rent_amount || "",
    trashUnit: row.trash_unit || "",

    elecOld: row.elec_old || "",
    elecNew: row.elec_new || "",
    elecUnit: row.elec_unit || "",

    waterOld: row.water_old || "",
    waterNew: row.water_new || "",
    waterUnit: row.water_unit || "",

    previousDebt: row.previous_debt || "",
    paid: row.paid || "",

    currentMonthTotal: Number(row.current_month_total || 0),
    total: Number(row.total || 0),
    debt: Number(row.debt || 0),
  };
}

function roomFromDb(row, invoices) {
  return {
    id: row.id,
    roomName: row.room_name || "",
    tenantName: row.tenant_name || "",
    defaultRent: Number(row.default_rent || 0),
    defaultTrash: Number(row.default_trash || 15000),
    invoices: invoices
      .filter((invoice) => invoice.room_id === row.id)
      .map(invoiceFromDb),
  };
}

function blockFromDb(row, rooms, invoices) {
  return {
    id: row.id,
    name: row.name || "",
    rooms: rooms
      .filter((room) => room.block_id === row.id)
      .map((room) => roomFromDb(room, invoices)),
  };
}

function invoiceToDbRow({ userId, blockId, roomId, invoicePayload }) {
  const totals = calculateInvoiceTotals(invoicePayload);

  return {
    user_id: userId,
    block_id: blockId,
    room_id: roomId,

    year: Number(invoicePayload.year),
    month: Number(invoicePayload.month),

    room_name: normalizeTextValue(invoicePayload.roomName),
    tenant_name: normalizeTextValue(invoicePayload.tenantName),
    date: normalizeTextValue(invoicePayload.date),

    rent_amount: normalizeTextValue(invoicePayload.rentAmount),
    trash_unit: normalizeTextValue(invoicePayload.trashUnit),

    elec_old: normalizeTextValue(invoicePayload.elecOld),
    elec_new: normalizeTextValue(invoicePayload.elecNew),
    elec_unit: normalizeTextValue(invoicePayload.elecUnit),

    water_old: normalizeTextValue(invoicePayload.waterOld),
    water_new: normalizeTextValue(invoicePayload.waterNew),
    water_unit: normalizeTextValue(invoicePayload.waterUnit),

    previous_debt: normalizeTextValue(invoicePayload.previousDebt),
    paid: normalizeTextValue(invoicePayload.paid),

    current_month_total: totals.currentMonthTotal,
    total: totals.total,
    debt: totals.debt,

    updated_at: new Date().toISOString(),
  };
}

/* =========================
   LOAD DATA
========================= */

export async function loadDataFromSupabase() {
  const user = await requireUser();

  const [blocksResult, roomsResult, invoicesResult] = await Promise.all([
    supabase
      .from("blocks")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),

    supabase
      .from("rooms")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),

    supabase
      .from("invoices")
      .select("*")
      .eq("user_id", user.id)
      .order("year", { ascending: false })
      .order("month", { ascending: false }),
  ]);

  if (blocksResult.error) throw blocksResult.error;
  if (roomsResult.error) throw roomsResult.error;
  if (invoicesResult.error) throw invoicesResult.error;

  const blocks = blocksResult.data || [];
  const rooms = roomsResult.data || [];
  const invoices = invoicesResult.data || [];

  if (blocks.length === 0) {
    const defaultBlock = await createBlockOnServer("Dãy A");

    return {
      blocks: [
        {
          ...defaultBlock,
          rooms: [],
        },
      ],
    };
  }

  return {
    blocks: blocks.map((block) => blockFromDb(block, rooms, invoices)),
  };
}

/* =========================
   BLOCKS / DÃY
========================= */

export async function createBlockOnServer(name) {
  const user = await requireUser();

  const newBlock = {
    id: createId(),
    user_id: user.id,
    name: name.trim(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("blocks")
    .insert(newBlock)
    .select("*")
    .single();

  if (error) throw error;

  return {
    id: data.id,
    name: data.name,
    rooms: [],
  };
}

export async function renameBlockOnServer(blockId, newName) {
  const user = await requireUser();

  const blockName = String(newName || "").trim();

  if (!blockName) {
    throw new Error("Tên dãy không được để trống.");
  }

  const { error } = await supabase
    .from("blocks")
    .update({
      name: blockName,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("id", blockId);

  if (error) throw error;
}

export async function deleteBlockOnServer(blockId) {
  const user = await requireUser();

  const { error } = await supabase
    .from("blocks")
    .delete()
    .eq("user_id", user.id)
    .eq("id", blockId);

  if (error) throw error;
}

/* =========================
   ROOMS / PHÒNG
========================= */

export async function createRoomOnServer(blockId, roomPayload) {
  const user = await requireUser();

  const newRoom = {
    id: createId(),
    user_id: user.id,
    block_id: blockId,
    room_name: roomPayload.roomName.trim(),
    tenant_name: roomPayload.tenantName.trim(),
    default_rent: Number(roomPayload.defaultRent || 0),
    default_trash: Number(roomPayload.defaultTrash || 15000),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("rooms")
    .insert(newRoom)
    .select("*")
    .single();

  if (error) throw error;

  return {
    id: data.id,
    roomName: data.room_name,
    tenantName: data.tenant_name,
    defaultRent: Number(data.default_rent || 0),
    defaultTrash: Number(data.default_trash || 15000),
    invoices: [],
  };
}

export async function updateRoomOnServer(blockId, roomId, updates) {
  const user = await requireUser();

  const payload = {
    updated_at: new Date().toISOString(),
  };

  if (updates.roomName !== undefined) {
    payload.room_name = updates.roomName;
  }

  if (updates.tenantName !== undefined) {
    payload.tenant_name = updates.tenantName;
  }

  if (updates.defaultRent !== undefined) {
    payload.default_rent = Number(updates.defaultRent || 0);
  }

  if (updates.defaultTrash !== undefined) {
    payload.default_trash = Number(updates.defaultTrash || 15000);
  }

  const { error } = await supabase
    .from("rooms")
    .update(payload)
    .eq("user_id", user.id)
    .eq("block_id", blockId)
    .eq("id", roomId);

  if (error) throw error;
}

export async function renameRoomOnServer(roomId, newRoomName) {
  const user = await requireUser();

  const roomName = String(newRoomName || "").trim();

  if (!roomId) {
    throw new Error("Thiếu ID phòng.");
  }

  if (!roomName) {
    throw new Error("Tên phòng không được để trống.");
  }

  const { error } = await supabase
    .from("rooms")
    .update({
      room_name: roomName,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("id", roomId);

  if (error) throw error;
}

export async function deleteRoomOnServer(roomId) {
  const user = await requireUser();

  const { error } = await supabase
    .from("rooms")
    .delete()
    .eq("user_id", user.id)
    .eq("id", roomId);

  if (error) throw error;
}

/* =========================
   INVOICES / PHIẾU THU
========================= */

export async function upsertInvoiceOnServer({
  blockId,
  roomId,
  invoicePayload,
  roomUpdates = {},
}) {
  const user = await requireUser();

  if (roomUpdates && Object.keys(roomUpdates).length > 0) {
    await updateRoomOnServer(blockId, roomId, roomUpdates);
  }

  const invoiceRow = invoiceToDbRow({
    userId: user.id,
    blockId,
    roomId,
    invoicePayload,
  });

  const { error } = await supabase.from("invoices").upsert(invoiceRow, {
    onConflict: "user_id,room_id,year,month",
  });

  if (error) throw error;
}

export async function deleteInvoiceOnServer(roomId, year, month) {
  const user = await requireUser();

  const { error } = await supabase
    .from("invoices")
    .delete()
    .eq("user_id", user.id)
    .eq("room_id", roomId)
    .eq("year", Number(year))
    .eq("month", Number(month));

  if (error) throw error;
}

export async function deleteInvoicesByMonthOnServer(year, month) {
  const user = await requireUser();

  const { error } = await supabase
    .from("invoices")
    .delete()
    .eq("user_id", user.id)
    .eq("year", Number(year))
    .eq("month", Number(month));

  if (error) throw error;
}

/* =========================
   OPTIONAL FALLBACK
========================= */

export function getEmptyData() {
  return EMPTY_DATA;
}
