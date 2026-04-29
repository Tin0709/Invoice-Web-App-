const STORAGE_KEY = "motel_receipt_data_v1";

export function createId() {
  if (
    typeof globalThis !== "undefined" &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createDefaultData() {
  return {
    blocks: [
      {
        id: createId(),
        name: "Dãy A",
        rooms: [
          {
            id: createId(),
            roomName: "Phòng 1",
            tenantName: "Người thuê mẫu",
            defaultRent: 2500000,
            defaultTrash: 15000,
            invoices: [],
          },
        ],
      },
    ],
  };
}

function normalizeData(data) {
  if (!data || !Array.isArray(data.blocks)) {
    return createDefaultData();
  }

  return {
    ...data,
    blocks: data.blocks.map((block) => ({
      ...block,
      rooms: Array.isArray(block.rooms)
        ? block.rooms.map((room) => ({
            ...room,
            invoices: Array.isArray(room.invoices) ? room.invoices : [],
            defaultRent: Number(room.defaultRent || 0),
            defaultTrash: Number(room.defaultTrash || 15000),
          }))
        : [],
    })),
  };
}

export function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      const defaultData = createDefaultData();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultData));
      return defaultData;
    }

    const parsed = JSON.parse(raw);
    return normalizeData(parsed);
  } catch (error) {
    console.error("loadData error:", error);
    return createDefaultData();
  }
}

export function saveData(data) {
  try {
    const normalized = normalizeData(data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch (error) {
    console.error("saveData error:", error);
    return data;
  }
}

export function formatCurrency(value) {
  return Number(value || 0).toLocaleString("vi-VN");
}

export function findBlockById(data, blockId) {
  return data.blocks.find((block) => block.id === blockId);
}

export function findRoomById(data, blockId, roomId) {
  const block = findBlockById(data, blockId);
  if (!block) return null;

  return block.rooms.find((room) => room.id === roomId);
}

export function sortInvoicesDesc(invoices = []) {
  return [...invoices].sort((a, b) => {
    const dateA = new Date(Number(a.year), Number(a.month) - 1, 1).getTime();
    const dateB = new Date(Number(b.year), Number(b.month) - 1, 1).getTime();

    return dateB - dateA;
  });
}

export function getInvoiceByPeriod(room, year, month) {
  if (!room || !Array.isArray(room.invoices) || room.invoices.length === 0) {
    return null;
  }

  return (
    room.invoices.find(
      (invoice) =>
        Number(invoice.year) === Number(year) &&
        Number(invoice.month) === Number(month)
    ) || null
  );
}

export function getPreviousMonth(year, month) {
  const y = Number(year);
  const m = Number(month);

  if (!y || !m) return null;

  if (m === 1) {
    return { year: y - 1, month: 12 };
  }

  return { year: y, month: m - 1 };
}

export function getPreviousInvoice(room, year, month) {
  const prev = getPreviousMonth(year, month);

  if (!prev) return null;

  return getInvoiceByPeriod(room, prev.year, prev.month);
}

export function upsertInvoiceForRoom(
  blockId,
  roomId,
  invoicePayload,
  roomUpdates = {}
) {
  const data = loadData();

  const nextData = {
    ...data,
    blocks: data.blocks.map((block) => {
      if (block.id !== blockId) return block;

      return {
        ...block,
        rooms: block.rooms.map((room) => {
          if (room.id !== roomId) return room;

          const invoices = Array.isArray(room.invoices)
            ? [...room.invoices]
            : [];

          const existingIndex = invoices.findIndex(
            (invoice) =>
              Number(invoice.year) === Number(invoicePayload.year) &&
              Number(invoice.month) === Number(invoicePayload.month)
          );

          if (existingIndex >= 0) {
            invoices[existingIndex] = {
              ...invoices[existingIndex],
              ...invoicePayload,
            };
          } else {
            invoices.push(invoicePayload);
          }

          return {
            ...room,
            ...roomUpdates,
            invoices,
          };
        }),
      };
    }),
  };

  return saveData(nextData);
}

export function updateRoomInfo(blockId, roomId, updates) {
  const data = loadData();

  const nextData = {
    ...data,
    blocks: data.blocks.map((block) => {
      if (block.id !== blockId) return block;

      return {
        ...block,
        rooms: block.rooms.map((room) =>
          room.id === roomId ? { ...room, ...updates } : room
        ),
      };
    }),
  };

  return saveData(nextData);
}

function parseMoneyLike(value) {
  return Number(String(value ?? "").replace(/[^\d]/g, "")) || 0;
}

export function getInvoiceDebt(invoice) {
  if (!invoice) return 0;

  const rent = parseMoneyLike(invoice.rentAmount);
  const trash = parseMoneyLike(invoice.trashUnit);

  const elecOld = parseMoneyLike(invoice.elecOld);
  const elecNew = parseMoneyLike(invoice.elecNew);
  const elecUnit = parseMoneyLike(invoice.elecUnit);

  const waterOld = parseMoneyLike(invoice.waterOld);
  const waterNew = parseMoneyLike(invoice.waterNew);
  const waterUnit = parseMoneyLike(invoice.waterUnit);

  const paid = parseMoneyLike(invoice.paid);

  const elecUsed = Math.max(0, elecNew - elecOld);
  const waterUsed = Math.max(0, waterNew - waterOld);

  const total = rent + trash + elecUsed * elecUnit + waterUsed * waterUnit;

  return Math.max(0, total - paid);
}

export function getLatestInvoice(room) {
  if (!room || !Array.isArray(room.invoices) || room.invoices.length === 0) {
    return null;
  }

  return sortInvoicesDesc(room.invoices)[0];
}

export function getAllInvoicesFlat(data) {
  const all = [];
  const safeData = normalizeData(data);

  safeData.blocks.forEach((block) => {
    block.rooms.forEach((room) => {
      const invoices = Array.isArray(room.invoices) ? room.invoices : [];

      invoices.forEach((invoice) => {
        all.push({
          ...invoice,
          blockId: block.id,
          roomId: room.id,
          blockName: block.name,
          roomName: invoice.roomName || room.roomName,
          tenantName: invoice.tenantName || room.tenantName,
          debt: getInvoiceDebt(invoice),
        });
      });
    });
  });

  return sortInvoicesDesc(all);
}

export function deleteInvoice(blockId, roomId, year, month) {
  const data = loadData();

  const nextData = {
    ...data,
    blocks: data.blocks.map((block) => {
      if (block.id !== blockId) return block;

      return {
        ...block,
        rooms: block.rooms.map((room) => {
          if (room.id !== roomId) return room;

          const invoices = Array.isArray(room.invoices) ? room.invoices : [];

          return {
            ...room,
            invoices: invoices.filter(
              (invoice) =>
                !(
                  Number(invoice.year) === Number(year) &&
                  Number(invoice.month) === Number(month)
                )
            ),
          };
        }),
      };
    }),
  };

  return saveData(nextData);
}

export function deleteInvoicesByMonth(year, month) {
  const data = loadData();

  const nextData = {
    ...data,
    blocks: data.blocks.map((block) => ({
      ...block,
      rooms: block.rooms.map((room) => {
        const invoices = Array.isArray(room.invoices) ? room.invoices : [];

        return {
          ...room,
          invoices: invoices.filter(
            (invoice) =>
              !(
                Number(invoice.year) === Number(year) &&
                Number(invoice.month) === Number(month)
              )
          ),
        };
      }),
    })),
  };

  return saveData(nextData);
}
