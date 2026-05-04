import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../styles/invoice.css";
import { getAuthUser } from "../utils/auth";
import { supabase } from "../utils/supabase";
import {
  getInvoiceByPeriod,
  getPreviousInvoice,
  loadData,
  saveData,
} from "../utils/storage";
import {
  loadDataFromSupabase,
  upsertInvoiceOnServer,
} from "../utils/supabaseStorage";

/* =========================
   Helpers
========================= */

const INVOICE_DRAFT_PREFIX = "motel_receipt_invoice_draft";
const DRAFT_NOTICE_KEY = "motel_receipt_invoice_draft_notice";

const parseMoney = (v) => {
  const raw = String(v ?? "").replace(/[^\d]/g, "");
  return raw ? Number(raw) : 0;
};

const fmtVND = (n) => {
  try {
    return (n || 0).toLocaleString("vi-VN");
  } catch {
    return String(n || 0);
  }
};

const clampNonNegative = (n) => (n < 0 ? 0 : n);
const onlyDigits = (v) => String(v ?? "").replace(/[^\d]/g, "");
const digits = (v) => String(v ?? "").replace(/[^\d]/g, "");

const formatMoneyInput = (value) => {
  const raw = onlyDigits(value);
  if (!raw) return "";
  return fmtVND(Number(raw));
};

const toISODate = (y, m, d) => {
  const yyyy = String(y).padStart(4, "0");
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const splitISO = (iso) => {
  const [y, m, d] = String(iso || "").split("-");
  return { y: y || "", m: m || "", d: d || "" };
};

const daysInMonth = (year, month) => {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m) return 31;
  return new Date(y, m, 0).getDate();
};

const getQueryPeriod = () => {
  try {
    const params = new URLSearchParams(window.location.search);

    return {
      queryYear: params.get("year"),
      queryMonth: params.get("month"),
    };
  } catch {
    return {
      queryYear: null,
      queryMonth: null,
    };
  }
};

const getInitialInvoiceDate = (initialYear, initialMonth) => {
  const now = new Date();

  const yyyy = Number(initialYear) || now.getFullYear();
  const mmNumber = Number(initialMonth) || now.getMonth() + 1;

  const safeMonth = Math.min(Math.max(mmNumber, 1), 12);
  const maxDay = daysInMonth(yyyy, safeMonth);
  const safeDay = Math.min(now.getDate(), maxDay);

  return toISODate(yyyy, safeMonth, safeDay);
};

const findFreshRoom = (blockId, roomId, fallbackRoom) => {
  const data = loadData();
  const block = data.blocks?.find((item) => item.id === blockId);
  const room = block?.rooms?.find((item) => item.id === roomId);

  return room || fallbackRoom || null;
};

const getInvoiceBaseTotal = (invoice) => {
  if (!invoice) return 0;

  const rent = parseMoney(invoice.rentAmount);
  const trashAmount = parseMoney(invoice.trashUnit);

  const elecOld = parseMoney(invoice.elecOld);
  const elecNew = parseMoney(invoice.elecNew);
  const elecUnit = parseMoney(invoice.elecUnit);
  const elecUsed = clampNonNegative(elecNew - elecOld);
  const elecAmount = elecUsed * elecUnit;

  const waterOld = parseMoney(invoice.waterOld);
  const waterNew = parseMoney(invoice.waterNew);
  const waterUnit = parseMoney(invoice.waterUnit);
  const waterUsed = clampNonNegative(waterNew - waterOld);
  const waterAmount = waterUsed * waterUnit;

  return rent + trashAmount + elecAmount + waterAmount;
};

const getInvoiceDebt = (invoice) => {
  if (!invoice) return 0;

  const savedDebt =
    invoice.debt ??
    invoice.remaining ??
    invoice.remainingAmount ??
    invoice.debtAmount;

  if (savedDebt !== undefined && savedDebt !== null && savedDebt !== "") {
    return parseMoney(savedDebt);
  }

  const savedTotal = invoice.total ?? invoice.finalTotal ?? invoice.totalAmount;

  const total =
    savedTotal !== undefined && savedTotal !== null && savedTotal !== ""
      ? parseMoney(savedTotal)
      : getInvoiceBaseTotal(invoice) + parseMoney(invoice.previousDebt);

  const paid = parseMoney(invoice.paid);

  return clampNonNegative(total - paid);
};

function getDraftUserKey() {
  const user = getAuthUser();
  return user?.id || user?.email || "guest";
}

function getInvoiceDraftKey({ blockId, roomId, year, month }) {
  return [
    INVOICE_DRAFT_PREFIX,
    getDraftUserKey(),
    blockId || "no-block",
    roomId || "no-room",
    year || "no-year",
    month || "no-month",
  ].join("_");
}

function normalizeServerDraft(row) {
  if (!row) return null;

  return {
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

async function loadInvoiceDraftFromServer({ roomId, year, month }) {
  if (!roomId || !year || !month) return null;

  const { data, error } = await supabase
    .from("invoice_drafts")
    .select("id, block_id, room_id, year, month, meta, fields, updated_at")
    .eq("room_id", roomId)
    .eq("year", Number(year))
    .eq("month", Number(month))
    .maybeSingle();

  if (error) {
    throw error;
  }

  return normalizeServerDraft(data);
}

async function saveInvoiceDraftToServer({
  blockId,
  roomId,
  year,
  month,
  meta,
  f,
}) {
  if (!blockId || !roomId || !year || !month) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  const user = userData?.user;

  if (!user?.id) {
    throw new Error("Không tìm thấy tài khoản đang đăng nhập.");
  }

  const payload = {
    user_id: user.id,
    block_id: blockId,
    room_id: roomId,
    year: Number(year),
    month: Number(month),
    meta,
    fields: f,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("invoice_drafts")
    .upsert(payload, {
      onConflict: "user_id,room_id,year,month",
    })
    .select("id, block_id, room_id, year, month, meta, fields, updated_at")
    .single();

  if (error) {
    throw error;
  }

  return normalizeServerDraft(data);
}

async function deleteInvoiceDraftFromServer({ roomId, year, month }) {
  if (!roomId || !year || !month) return;

  const { error } = await supabase
    .from("invoice_drafts")
    .delete()
    .eq("room_id", roomId)
    .eq("year", Number(year))
    .eq("month", Number(month));

  if (error) {
    throw error;
  }
}

function loadInvoiceDraftFromLocal({ blockId, roomId, year, month }) {
  try {
    if (!blockId || !roomId || !year || !month) return null;

    const draftKey = getInvoiceDraftKey({ blockId, roomId, year, month });
    const raw = localStorage.getItem(draftKey);

    if (!raw) return null;

    const draft = JSON.parse(raw);

    if (!draft?.meta || !draft?.f) return null;

    return {
      ...draft,
      updatedAt: Number(draft.updatedAt || 0),
      draftKey,
      source: "local",
    };
  } catch {
    return null;
  }
}

function saveInvoiceDraftToLocal({
  blockId,
  roomId,
  year,
  month,
  meta,
  f,
  roomName,
}) {
  try {
    if (!blockId || !roomId || !year || !month) return null;

    const draftKey = getInvoiceDraftKey({ blockId, roomId, year, month });

    const draft = {
      blockId,
      roomId,
      year,
      month,
      meta,
      f,
      updatedAt: Date.now(),
    };

    localStorage.setItem(draftKey, JSON.stringify(draft));

    localStorage.setItem(
      DRAFT_NOTICE_KEY,
      JSON.stringify({
        draftKey,
        roomName: roomName || meta?.room || "phòng này",
        period: `${String(month).padStart(2, "0")}/${year}`,
        message: "⚠️ Phiếu thu chưa được lưu.",
        updatedAt: Date.now(),
      })
    );

    return draftKey;
  } catch {
    return null;
  }
}

function clearInvoiceDraftFromLocal({ blockId, roomId, year, month }) {
  try {
    if (!blockId || !roomId || !year || !month) return null;

    const draftKey = getInvoiceDraftKey({ blockId, roomId, year, month });
    localStorage.removeItem(draftKey);

    return draftKey;
  } catch {
    return null;
  }
}

function clearDraftNotice(draftKey) {
  try {
    const raw = localStorage.getItem(DRAFT_NOTICE_KEY);

    if (!raw) return;

    const notice = JSON.parse(raw);

    if (!draftKey || notice?.draftKey === draftKey) {
      localStorage.removeItem(DRAFT_NOTICE_KEY);
    }
  } catch {
    localStorage.removeItem(DRAFT_NOTICE_KEY);
  }
}

const createInitialInvoiceState = ({
  blockId,
  roomId,
  roomData,
  initialYear,
  initialMonth,
}) => {
  const { queryYear, queryMonth } = getQueryPeriod();

  const initialDate = getInitialInvoiceDate(
    initialYear || queryYear,
    initialMonth || queryMonth
  );

  const { y: year, m: month } = splitISO(initialDate);

  const freshRoom = findFreshRoom(blockId, roomId, roomData);

  const currentInvoice = freshRoom
    ? getInvoiceByPeriod(freshRoom, Number(year), Number(month))
    : null;

  const prevInvoice = freshRoom
    ? getPreviousInvoice(freshRoom, Number(year), Number(month))
    : null;

  const previousDebtFromLastMonth = prevInvoice
    ? fmtVND(getInvoiceDebt(prevInvoice))
    : "";

  const meta = {
    room:
      currentInvoice?.roomName ||
      freshRoom?.roomName ||
      roomData?.roomName ||
      "",
    tenant:
      currentInvoice?.tenantName ||
      freshRoom?.tenantName ||
      roomData?.tenantName ||
      "",
    date: currentInvoice?.date || initialDate,
  };

  const f = currentInvoice
    ? {
        rentAmount:
          currentInvoice.rentAmount ?? fmtVND(freshRoom?.defaultRent || 0),
        trashUnit:
          currentInvoice.trashUnit ?? fmtVND(freshRoom?.defaultTrash || 15000),
        elecOld: digits(currentInvoice.elecOld),
        elecNew: digits(currentInvoice.elecNew),
        elecUnit: currentInvoice.elecUnit ?? "3.200",
        waterOld: digits(currentInvoice.waterOld),
        waterNew: digits(currentInvoice.waterNew),
        waterUnit: currentInvoice.waterUnit ?? "12.000",
        previousDebt:
          currentInvoice.previousDebt !== undefined &&
          currentInvoice.previousDebt !== null
            ? fmtVND(parseMoney(currentInvoice.previousDebt))
            : previousDebtFromLastMonth,
        paid: currentInvoice.paid ?? "",
      }
    : {
        rentAmount: fmtVND(
          freshRoom?.defaultRent || roomData?.defaultRent || 0
        ),
        trashUnit: fmtVND(
          freshRoom?.defaultTrash || roomData?.defaultTrash || 15000
        ),
        elecOld: prevInvoice?.elecNew ? digits(prevInvoice.elecNew) : "",
        elecNew: "",
        elecUnit: prevInvoice?.elecUnit ?? "3.200",
        waterOld: prevInvoice?.waterNew ? digits(prevInvoice.waterNew) : "",
        waterNew: "",
        waterUnit: prevInvoice?.waterUnit ?? "12.000",
        previousDebt: previousDebtFromLastMonth,
        paid: "",
      };

  const localDraft = loadInvoiceDraftFromLocal({
    blockId,
    roomId,
    year,
    month,
  });

  return {
    meta: localDraft?.meta || meta,
    f: localDraft?.f || f,

    baseMeta: meta,
    baseF: f,

    draftRestored: Boolean(localDraft),
    draftUpdatedAt: localDraft?.updatedAt || null,
  };
};

/* =========================
   Child blocks
========================= */

function MetersBlock({ f, calc, setDigitsField, setMoneyField, applyPrevOld }) {
  return (
    <>
      <div className="sectionTitleRow">
        <div className="sectionTitle">Chỉ số điện & nước</div>

        <button
          className="btn tiny no-print"
          type="button"
          onClick={applyPrevOld}
        >
          ↥ Lấy số cũ tháng trước
        </button>
      </div>

      <div className="meterGrid">
        <div className="meterCard">
          <div className="meterHead">
            <div className="meterTitle">Điện (kWh)</div>
          </div>

          <div className="meterFields">
            <div className="mf">
              <div className="mfLabel">Số cũ</div>

              <div className="unit-input-wrap">
                <input
                  className="cell-input unit-input"
                  value={f.elecOld}
                  onChange={setDigitsField("elecOld")}
                  inputMode="numeric"
                  placeholder="Số tháng trước"
                />
                <span className="unit-suffix">kWh</span>
              </div>
            </div>

            <div className="mf">
              <div className="mfLabel">Số mới</div>

              <div className="unit-input-wrap">
                <input
                  className="cell-input unit-input"
                  value={f.elecNew}
                  onChange={setDigitsField("elecNew")}
                  inputMode="numeric"
                  placeholder="0"
                />
                <span className="unit-suffix">kWh</span>
              </div>
            </div>

            <div className="mf">
              <div className="mfLabel">Sử dụng</div>

              <div className="unit-input-wrap">
                <input
                  className="cell-input unit-input"
                  value={fmtVND(calc.elecUsed)}
                  readOnly
                />
                <span className="unit-suffix">kWh</span>
              </div>
            </div>
          </div>

          <div className="meterBottom">
            <div className="mb">
              <div className="mfLabel">Đơn giá (VND/kWh)</div>
              <input
                className="cell-input money"
                value={f.elecUnit}
                onChange={setMoneyField("elecUnit")}
                inputMode="numeric"
              />
            </div>

            <div className="mb">
              <div className="mfLabel">Thành tiền (VND)</div>
              <input
                className="cell-input money"
                value={fmtVND(calc.elecAmount)}
                readOnly
              />
            </div>
          </div>
        </div>

        <div className="meterCard">
          <div className="meterHead">
            <div className="meterTitle">Nước (m³)</div>
          </div>

          <div className="meterFields">
            <div className="mf">
              <div className="mfLabel">Số cũ</div>

              <div className="unit-input-wrap">
                <input
                  className="cell-input unit-input"
                  value={f.waterOld}
                  onChange={setDigitsField("waterOld")}
                  inputMode="numeric"
                  placeholder="Số tháng trước"
                />
                <span className="unit-suffix">khối</span>
              </div>
            </div>

            <div className="mf">
              <div className="mfLabel">Số mới</div>

              <div className="unit-input-wrap">
                <input
                  className="cell-input unit-input"
                  value={f.waterNew}
                  onChange={setDigitsField("waterNew")}
                  inputMode="numeric"
                  placeholder="0"
                />
                <span className="unit-suffix">khối</span>
              </div>
            </div>

            <div className="mf">
              <div className="mfLabel">Sử dụng</div>

              <div className="unit-input-wrap">
                <input
                  className="cell-input unit-input"
                  value={fmtVND(calc.waterUsed)}
                  readOnly
                />
                <span className="unit-suffix">khối</span>
              </div>
            </div>
          </div>

          <div className="meterBottom">
            <div className="mb">
              <div className="mfLabel">Đơn giá (VND/m³)</div>
              <input
                className="cell-input money"
                value={f.waterUnit}
                onChange={setMoneyField("waterUnit")}
                inputMode="numeric"
              />
            </div>

            <div className="mb">
              <div className="mfLabel">Thành tiền (VND)</div>
              <input
                className="cell-input money"
                value={fmtVND(calc.waterAmount)}
                readOnly
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function FixedFeesBlock({ f, setMoneyField }) {
  return (
    <>
      <div className="sectionTitle">Khoản cố định</div>

      <div className="feesGrid">
        <div className="feeRow">
          <div className="feeName">Tiền phòng</div>
          <div className="feeRight">
            <input
              className="cell-input money"
              value={f.rentAmount}
              onChange={setMoneyField("rentAmount")}
              inputMode="numeric"
              placeholder="0"
            />
          </div>
        </div>

        <div className="feeRow">
          <div className="feeName">Tiền rác</div>
          <div className="feeRight">
            <input
              className="cell-input money"
              value={f.trashUnit}
              onChange={setMoneyField("trashUnit")}
              inputMode="numeric"
              placeholder="15.000"
            />
          </div>
        </div>
      </div>
    </>
  );
}

/* =========================
   Main component
========================= */

export default function Invoice({
  blockId,
  roomId,
  roomData,
  initialYear,
  initialMonth,
  onDirtyChange,
  registerSaveHandler,
}) {
  const initialState = useMemo(
    () =>
      createInitialInvoiceState({
        blockId,
        roomId,
        roomData,
        initialYear,
        initialMonth,
      }),
    [blockId, roomId, roomData, initialYear, initialMonth]
  );

  const [meta, setMeta] = useState(initialState.meta);
  const [f, setF] = useState(initialState.f);
  const [saveMessage, setSaveMessage] = useState("");

  const draftRestoreToastShownRef = useRef(false);
  const serverDraftPeriodRef = useRef("");
  const serverSaveTimerRef = useRef(null);
  const latestDraftPayloadRef = useRef(null);
  const saveMessageTimerRef = useRef(null);

  const {
    y: year,
    m: month,
    d: day,
  } = useMemo(() => splitISO(meta.date), [meta.date]);

  const [monthText, setMonthText] = useState(month);
  const [yearText, setYearText] = useState(year);
  const [roomText, setRoomText] = useState(meta.room);

  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(() =>
    JSON.stringify({
      meta: initialState.baseMeta || initialState.meta,
      f: initialState.baseF || initialState.f,
      year: splitISO((initialState.baseMeta || initialState.meta).date).y,
      month: splitISO((initialState.baseMeta || initialState.meta).date).m,
      roomId,
      blockId,
    })
  );

  const calc = useMemo(() => {
    const rent = parseMoney(f.rentAmount);

    const trashUnit = parseMoney(f.trashUnit);
    const trashAmount = trashUnit;

    const elecOld = parseMoney(f.elecOld);
    const elecNew = parseMoney(f.elecNew);
    const elecUnit = parseMoney(f.elecUnit);
    const elecUsed = clampNonNegative(elecNew - elecOld);
    const elecAmount = elecUsed * elecUnit;

    const waterOld = parseMoney(f.waterOld);
    const waterNew = parseMoney(f.waterNew);
    const waterUnit = parseMoney(f.waterUnit);
    const waterUsed = clampNonNegative(waterNew - waterOld);
    const waterAmount = waterUsed * waterUnit;

    const currentMonthTotal = rent + trashAmount + elecAmount + waterAmount;
    const previousDebt = parseMoney(f.previousDebt);

    const total = currentMonthTotal + previousDebt;
    const paid = parseMoney(f.paid);
    const debt = clampNonNegative(total - paid);

    return {
      rent,
      trashAmount,
      elecUsed,
      elecAmount,
      waterUsed,
      waterAmount,
      currentMonthTotal,
      previousDebt,
      total,
      paid,
      debt,
    };
  }, [f]);

  const buildSnapshot = useCallback(() => {
    return JSON.stringify({
      meta,
      f,
      year,
      month,
      roomId,
      blockId,
    });
  }, [meta, f, year, month, roomId, blockId]);

  const isDirty =
    lastSavedSnapshot !== null && buildSnapshot() !== lastSavedSnapshot;

  const showDropdownToast = useCallback((message, duration = 1800) => {
    if (saveMessageTimerRef.current) {
      clearTimeout(saveMessageTimerRef.current);
    }

    setSaveMessage(message);

    if (duration > 0) {
      saveMessageTimerRef.current = setTimeout(() => {
        setSaveMessage("");
        saveMessageTimerRef.current = null;
      }, duration);
    } else {
      saveMessageTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (typeof onDirtyChange === "function") {
      onDirtyChange(isDirty);
    }
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    const periodKey = `${blockId || ""}_${roomId || ""}_${year || ""}_${
      month || ""
    }`;

    if (!blockId || !roomId || !year || !month) return;
    if (serverDraftPeriodRef.current === periodKey) return;

    serverDraftPeriodRef.current = periodKey;

    let cancelled = false;

    const loadServerDraft = async () => {
      try {
        const serverDraft = await loadInvoiceDraftFromServer({
          roomId,
          year,
          month,
        });

        if (cancelled || !serverDraft) return;

        const localDraftTime = Number(initialState.draftUpdatedAt || 0);
        const serverDraftTime = Number(serverDraft.updatedAt || 0);

        if (serverDraftTime < localDraftTime) return;

        setMeta(serverDraft.meta);
        setF(serverDraft.f);

        const nextDateParts = splitISO(serverDraft.meta?.date || meta.date);

        setMonthText(nextDateParts.m || month);
        setYearText(nextDateParts.y || year);
        setRoomText(serverDraft.meta?.room || meta.room || "");

        showDropdownToast("📝 Đã khôi phục bản nháp chưa lưu.", 2200);
      } catch (error) {
        console.error("Load invoice draft from Supabase error:", error);
      }
    };

    loadServerDraft();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockId, roomId, year, month]);

  useEffect(() => {
    if (!isDirty || !blockId || !roomId || !year || !month) return;

    saveInvoiceDraftToLocal({
      blockId,
      roomId,
      year,
      month,
      meta,
      f,
      roomName: meta.room || roomText,
    });

    const draftPayload = {
      blockId,
      roomId,
      year,
      month,
      meta,
      f,
    };

    latestDraftPayloadRef.current = draftPayload;

    if (serverSaveTimerRef.current) {
      clearTimeout(serverSaveTimerRef.current);
    }

    serverSaveTimerRef.current = setTimeout(async () => {
      try {
        await saveInvoiceDraftToServer(draftPayload);
      } catch (error) {
        console.error("Save invoice draft to Supabase error:", error);
      }
    }, 650);
  }, [isDirty, blockId, roomId, year, month, meta, f, roomText]);

  useEffect(() => {
    return () => {
      if (serverSaveTimerRef.current) {
        clearTimeout(serverSaveTimerRef.current);
      }

      if (latestDraftPayloadRef.current) {
        saveInvoiceDraftToServer(latestDraftPayloadRef.current).catch(
          (error) => {
            console.error("Final save invoice draft error:", error);
          }
        );
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (saveMessageTimerRef.current) {
        clearTimeout(saveMessageTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!initialState.draftRestored) return undefined;
    if (draftRestoreToastShownRef.current) return undefined;

    draftRestoreToastShownRef.current = true;
    showDropdownToast("📝 Đã khôi phục bản nháp chưa lưu.", 2200);

    return undefined;
  }, [initialState.draftRestored, showDropdownToast]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!isDirty) return;

      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);

  const setMetaField = (field) => (e) => {
    const value = e.target.value;
    setMeta((s) => ({ ...s, [field]: value }));
  };

  const setDate = (e) => {
    const value = e.target.value;
    setMeta((s) => ({ ...s, date: value }));

    const { y, m } = splitISO(value);
    if (m) setMonthText(m);
    if (y) setYearText(y);
  };

  const setDigitsField = (field) => (e) => {
    const value = digits(e.target.value);
    setF((s) => ({ ...s, [field]: value }));
  };

  const setMoneyField = (field) => (e) => {
    const value = formatMoneyInput(e.target.value);
    setF((s) => ({ ...s, [field]: value }));
  };

  const refreshPreviousDebt = (targetYear, targetMonth) => {
    const freshRoom = findFreshRoom(blockId, roomId, roomData);
    if (!freshRoom || !targetYear || !targetMonth) return;

    const prev = getPreviousInvoice(
      freshRoom,
      Number(targetYear),
      Number(targetMonth)
    );

    setF((s) => ({
      ...s,
      previousDebt: prev ? fmtVND(getInvoiceDebt(prev)) : "",
    }));
  };

  const commitMonth = () => {
    const raw = onlyDigits(monthText).slice(0, 2);

    if (!raw) {
      setMonthText(month);
      return;
    }

    const mm = String(Math.min(Math.max(Number(raw), 1), 12)).padStart(2, "0");
    const baseYear = year || String(new Date().getFullYear());
    const maxD = daysInMonth(baseYear, mm);
    const dd = String(Math.min(Number(day || 1), maxD)).padStart(2, "0");

    setMeta((s) => ({ ...s, date: toISODate(baseYear, mm, dd) }));
    setMonthText(mm);
    refreshPreviousDebt(baseYear, mm);
  };

  const commitYear = () => {
    const raw = onlyDigits(yearText).slice(0, 4);

    if (!raw || raw.length < 4) {
      setYearText(year);
      return;
    }

    const yyyy = raw;
    const baseMonth = month || "01";
    const maxD = daysInMonth(yyyy, baseMonth);
    const dd = String(Math.min(Number(day || 1), maxD)).padStart(2, "0");

    setMeta((s) => ({ ...s, date: toISODate(yyyy, baseMonth, dd) }));
    setYearText(yyyy);
    refreshPreviousDebt(yyyy, baseMonth);
  };

  const commitRoom = () => {
    const next = roomText.trim();
    setMeta((s) => ({ ...s, room: next }));
    setRoomText(next);
  };

  const applyPrevOld = () => {
    if (!year || !month) {
      showDropdownToast("⚠️ Vui lòng chọn tháng và năm hợp lệ.");
      return;
    }

    const freshRoom = findFreshRoom(blockId, roomId, roomData);

    if (!freshRoom) {
      showDropdownToast("⚠️ Không tìm thấy thông tin phòng.");
      return;
    }

    const prev = getPreviousInvoice(freshRoom, Number(year), Number(month));

    if (!prev) {
      showDropdownToast("⚠️ Không có dữ liệu tháng trước để lấy.");
      return;
    }

    const nextElecOld = prev.elecNew ? digits(prev.elecNew) : "";
    const nextWaterOld = prev.waterNew ? digits(prev.waterNew) : "";
    const nextPreviousDebt = fmtVND(getInvoiceDebt(prev));

    const alreadyUpdated =
      String(f.elecOld || "") === String(nextElecOld || "") &&
      String(f.waterOld || "") === String(nextWaterOld || "") &&
      String(f.previousDebt || "") === String(nextPreviousDebt || "");

    if (alreadyUpdated) {
      showDropdownToast("ℹ️ Số cũ tháng trước đã được cập nhật rồi.");
      return;
    }

    setF((s) => ({
      ...s,
      elecOld: nextElecOld || s.elecOld,
      waterOld: nextWaterOld || s.waterOld,
      previousDebt: nextPreviousDebt,
    }));

    showDropdownToast("✅ Đã lấy số cũ tháng trước.");
  };

  const resetNumbers = () => {
    const freshRoom = findFreshRoom(blockId, roomId, roomData);

    const prev =
      freshRoom && year && month
        ? getPreviousInvoice(freshRoom, Number(year), Number(month))
        : null;

    setF((s) => ({
      ...s,
      rentAmount: fmtVND(freshRoom?.defaultRent || 0),
      elecOld: "",
      elecNew: "",
      waterOld: "",
      waterNew: "",
      previousDebt: prev ? fmtVND(getInvoiceDebt(prev)) : "",
      paid: "",
      trashUnit: fmtVND(freshRoom?.defaultTrash || 15000),
      elecUnit: "3.200",
      waterUnit: "12.000",
    }));
  };

  const payFull = () => {
    setF((s) => ({
      ...s,
      paid: fmtVND(calc.total),
    }));
  };

  const doPrint = () => {
    window.print();
  };

  const handleSave = useCallback(async () => {
    if (!blockId || !roomId || !year || !month) return false;

    const invoicePayload = {
      year: Number(year),
      month: Number(month),
      roomName: meta.room,
      tenantName: meta.tenant,
      date: meta.date,
      rentAmount: f.rentAmount,
      trashUnit: f.trashUnit,
      elecOld: f.elecOld,
      elecNew: f.elecNew,
      elecUnit: f.elecUnit,
      waterOld: f.waterOld,
      waterNew: f.waterNew,
      waterUnit: f.waterUnit,
      previousDebt: f.previousDebt,
      currentMonthTotal: calc.currentMonthTotal,
      total: calc.total,
      paid: f.paid,
      debt: calc.debt,
      updatedAt: Date.now(),
    };

    const roomUpdates = {
      roomName: meta.room,
      tenantName: meta.tenant,
      defaultRent: parseMoney(f.rentAmount),
      defaultTrash: parseMoney(f.trashUnit),
    };

    try {
      showDropdownToast("Đang lưu phiếu...", 0);

      await upsertInvoiceOnServer({
        blockId,
        roomId,
        invoicePayload,
        roomUpdates,
      });

      const refreshedData = await loadDataFromSupabase();
      saveData(refreshedData);

      await deleteInvoiceDraftFromServer({
        roomId,
        year,
        month,
      });

      const clearedDraftKey = clearInvoiceDraftFromLocal({
        blockId,
        roomId,
        year,
        month,
      });

      clearDraftNotice(clearedDraftKey);
      latestDraftPayloadRef.current = null;

      const snapshotAfterSave = JSON.stringify({
        meta,
        f,
        year,
        month,
        roomId,
        blockId,
      });

      setLastSavedSnapshot(snapshotAfterSave);
      showDropdownToast("Đã lưu phiếu thành công.", 1800);

      return true;
    } catch (error) {
      console.error("Save invoice error:", error);
      showDropdownToast(error.message || "Không thể lưu phiếu.", 2400);

      return false;
    }
  }, [blockId, roomId, year, month, meta, f, calc, showDropdownToast]);

  useEffect(() => {
    if (typeof registerSaveHandler === "function") {
      registerSaveHandler(handleSave);
    }
  }, [registerSaveHandler, handleSave]);

  return (
    <>
      {saveMessage &&
        createPortal(
          <div className="save-toast no-print" role="status">
            {saveMessage === "Đã lưu phiếu thành công."
              ? "✅ Đã lưu phiếu thành công."
              : saveMessage}
          </div>,
          document.body
        )}

      <div className="topbar no-print">
        <div className="actions actions-only">
          <button className="btn" type="button" onClick={resetNumbers}>
            ↺ Reset
          </button>

          <button className="btn primary" type="button" onClick={doPrint}>
            🖨️ In / PDF
          </button>
        </div>
      </div>

      <section className="invoice" aria-label="Phiếu thu">
        <header className="invoice-header">
          <div className="title">PHIẾU THU TIỀN PHÒNG TRỌ</div>

          <div className="metaGrid">
            <div className="mLabel">Tháng:</div>
            <input
              className="input"
              value={monthText}
              onChange={(e) =>
                setMonthText(onlyDigits(e.target.value).slice(0, 2))
              }
              onBlur={commitMonth}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                  commitMonth();
                }
              }}
              inputMode="numeric"
              placeholder="VD: 03"
            />

            <div className="mLabel">Năm:</div>
            <input
              className="input"
              value={yearText}
              onChange={(e) =>
                setYearText(onlyDigits(e.target.value).slice(0, 4))
              }
              onBlur={commitYear}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                  commitYear();
                }
              }}
              inputMode="numeric"
              placeholder="VD: 2026"
            />

            <div className="mLabel">Phòng số:</div>
            <input
              className="input"
              value={roomText}
              onChange={(e) => setRoomText(e.target.value)}
              onBlur={commitRoom}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                  commitRoom();
                }
              }}
              placeholder="VD: 101"
            />

            <div className="mLabel">Ngày thu:</div>
            <input
              className="input dateInput"
              type="date"
              value={meta.date}
              onChange={setDate}
            />

            <div className="mLabel">Tên người thuê:</div>
            <input
              className="input spanRest"
              value={meta.tenant}
              onChange={setMetaField("tenant")}
              placeholder="VD: Nguyễn Văn A"
            />
          </div>
        </header>

        <div className="table-wrap">
          <FixedFeesBlock f={f} setMoneyField={setMoneyField} />

          <MetersBlock
            f={f}
            calc={calc}
            setDigitsField={setDigitsField}
            setMoneyField={setMoneyField}
            applyPrevOld={applyPrevOld}
          />

          <div className="summary summary-only-totals">
            <div className="totals">
              <div className="row">
                <div className="k">THÁNG NÀY:</div>
                <div className="v">{fmtVND(calc.currentMonthTotal)}</div>
              </div>

              <div className="row">
                <div className="k">THIẾU THÁNG TRƯỚC:</div>
                <div className="v-input">
                  <input
                    className="cell-input money"
                    value={f.previousDebt}
                    onChange={setMoneyField("previousDebt")}
                    inputMode="numeric"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="row total">
                <div className="k">TỔNG CỘNG:</div>
                <div className="v total-value">{fmtVND(calc.total)} VND</div>
              </div>

              <div className="row">
                <div className="k">ĐÃ TRẢ:</div>
                <div className="v-input paid-input-wrap">
                  <input
                    className="cell-input money"
                    value={f.paid}
                    onChange={setMoneyField("paid")}
                    inputMode="numeric"
                    placeholder="0"
                  />

                  <button
                    className="pay-full-btn no-print"
                    type="button"
                    onClick={payFull}
                  >
                    Trả đủ
                  </button>
                </div>
              </div>

              <div className="row">
                <div className="k">CÒN THIẾU:</div>
                <div className={`v ${calc.debt === 0 ? "ok" : "debt"}`}>
                  {fmtVND(calc.debt)}
                </div>
              </div>
            </div>
          </div>

          <footer className="invoice-footer no-print">
            <div>Dữ liệu chỉ vào lịch sử sau khi bấm Lưu.</div>
            <div>
              Phòng {meta.room || "—"} •{" "}
              {year && month ? `${year}-${month}` : "—"}
            </div>
          </footer>

          <div className="bottom-save-area no-print">
            <button
              className="save-main-btn"
              type="button"
              onClick={handleSave}
            >
              💾 Lưu phiếu thu
            </button>

            <p className="save-hint">
              Dữ liệu chỉ được ghi vào lịch sử sau khi bấm nút Lưu.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
