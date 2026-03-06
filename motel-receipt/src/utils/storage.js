const STORAGE_KEY = "motel_receipt_data_v1";

const defaultData = {
  blocks: [
    {
      id: crypto.randomUUID(),
      name: "Dãy A",
      rooms: [
        {
          id: crypto.randomUUID(),
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

export function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultData));
      return defaultData;
    }

    const parsed = JSON.parse(raw);

    if (!parsed || !Array.isArray(parsed.blocks)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultData));
      return defaultData;
    }

    return parsed;
  } catch (error) {
    console.error("loadData error:", error);
    return defaultData;
  }
}

export function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("saveData error:", error);
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
    const dateA = new Date(a.year, a.month - 1, 1).getTime();
    const dateB = new Date(b.year, b.month - 1, 1).getTime();
    return dateB - dateA;
  });
}
