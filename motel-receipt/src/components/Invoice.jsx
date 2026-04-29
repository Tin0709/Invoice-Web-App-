import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../styles/invoice.css";
import {
  getInvoiceByPeriod,
  getPreviousInvoice,
  loadData,
  updateRoomInfo,
  upsertInvoiceForRoom,
} from "../utils/storage";

/* =========================
   Helpers
========================= */
const DRAFT_STORAGE_KEY = "motel_receipt_invoice_drafts_v1";

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

const getDraftKey = (blockId, roomId, year, month) => {
  return `${blockId}__${roomId}__${Number(year)}__${Number(month)}`;
};

const loadAllDrafts = () => {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const saveAllDrafts = (drafts) => {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // ignore localStorage error
  }
};

const loadInvoiceDraft = (blockId, roomId, year, month) => {
  const key = getDraftKey(blockId, roomId, year, month);
  const drafts = loadAllDrafts();
  return drafts[key] || null;
};

const saveInvoiceDraft = (blockId, roomId, year, month, draft) => {
  const key = getDraftKey(blockId, roomId, year, month);
  const drafts = loadAllDrafts();

  drafts[key] = {
    ...draft,
    updatedAt: Date.now(),
  };

  saveAllDrafts(drafts);
};

const clearInvoiceDraft = (blockId, roomId, year, month) => {
  const key = getDraftKey(blockId, roomId, year, month);
  const drafts = loadAllDrafts();

  if (drafts[key]) {
    delete drafts[key];
    saveAllDrafts(drafts);
  }
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
              <input
                className="cell-input"
                value={f.elecOld}
                onChange={setDigitsField("elecOld")}
                inputMode="numeric"
                placeholder="Số tháng trước"
              />
            </div>

            <div className="mf">
              <div className="mfLabel">Số mới</div>
              <input
                className="cell-input"
                value={f.elecNew}
                onChange={setDigitsField("elecNew")}
                inputMode="numeric"
                placeholder="0"
              />
            </div>

            <div className="mf">
              <div className="mfLabel">Sử dụng</div>
              <input
                className="cell-input"
                value={fmtVND(calc.elecUsed)}
                readOnly
              />
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
              <input
                className="cell-input"
                value={f.waterOld}
                onChange={setDigitsField("waterOld")}
                inputMode="numeric"
                placeholder="Số tháng trước"
              />
            </div>

            <div className="mf">
              <div className="mfLabel">Số mới</div>
              <input
                className="cell-input"
                value={f.waterNew}
                onChange={setDigitsField("waterNew")}
                inputMode="numeric"
                placeholder="0"
              />
            </div>

            <div className="mf">
              <div className="mfLabel">Sử dụng</div>
              <input
                className="cell-input"
                value={fmtVND(calc.waterUsed)}
                readOnly
              />
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
  const [meta, setMeta] = useState(() => {
    const { queryYear, queryMonth } = getQueryPeriod();

    return {
      room: roomData?.roomName || "",
      tenant: roomData?.tenantName || "",
      date: getInitialInvoiceDate(
        initialYear || queryYear,
        initialMonth || queryMonth
      ),
    };
  });

  const {
    y: year,
    m: month,
    d: day,
  } = useMemo(() => splitISO(meta.date), [meta.date]);

  const [monthText, setMonthText] = useState(month);
  const [yearText, setYearText] = useState(year);
  const [roomText, setRoomText] = useState(roomData?.roomName || "");

  const [f, setF] = useState({
    rentAmount: roomData?.defaultRent ? fmtVND(roomData.defaultRent) : "",
    trashUnit: roomData?.defaultTrash
      ? fmtVND(roomData.defaultTrash)
      : "15.000",
    elecOld: "",
    elecNew: "",
    elecUnit: "3.200",
    waterOld: "",
    waterNew: "",
    waterUnit: "12.000",
    paid: "",
  });

  const [saveMessage, setSaveMessage] = useState("");
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(null);

  const lastHydratedKeyRef = useRef("");
  const roomDataRef = useRef(roomData);
  const currentDateRef = useRef(meta.date);
  const hasHydratedRef = useRef(false);

  useEffect(() => {
    roomDataRef.current = roomData;
  }, [roomData]);

  useEffect(() => {
    currentDateRef.current = meta.date;
  }, [meta.date]);

  const getFreshRoomData = useCallback(() => {
    try {
      const latestData = loadData();
      const block = latestData.blocks?.find((item) => item.id === blockId);
      const room = block?.rooms?.find((item) => item.id === roomId);

      return room || roomDataRef.current || null;
    } catch {
      return roomDataRef.current || null;
    }
  }, [blockId, roomId]);

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

    const total = rent + trashAmount + elecAmount + waterAmount;
    const paid = parseMoney(f.paid);
    const debt = clampNonNegative(total - paid);

    return {
      rent,
      trashAmount,
      elecUsed,
      elecAmount,
      waterUsed,
      waterAmount,
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
  };

  const commitRoom = () => {
    const next = roomText.trim();
    setMeta((s) => ({ ...s, room: next }));
    setRoomText(next);
  };

  useEffect(() => {
    if (!blockId || !roomId || !year || !month) return;

    const currentRoomData = getFreshRoomData();
    if (!currentRoomData) return;

    const yearNumber = Number(year);
    const monthNumber = Number(month);

    if (!yearNumber || !monthNumber) return;

    const currentInvoice = getInvoiceByPeriod(
      currentRoomData,
      yearNumber,
      monthNumber
    );

    const prevInvoice = getPreviousInvoice(
      currentRoomData,
      yearNumber,
      monthNumber
    );

    const draft = loadInvoiceDraft(blockId, roomId, yearNumber, monthNumber);

    const hydrateKey = [
      roomId,
      yearNumber,
      monthNumber,
      currentInvoice?.updatedAt || "new",
      draft?.updatedAt || "no-draft",
      currentRoomData.roomName || "",
      currentRoomData.tenantName || "",
      currentRoomData.defaultRent || 0,
      currentRoomData.defaultTrash || 15000,
    ].join(":");

    if (lastHydratedKeyRef.current === hydrateKey) return;
    lastHydratedKeyRef.current = hydrateKey;

    const savedMeta = {
      room: currentInvoice?.roomName || currentRoomData.roomName || "",
      tenant: currentInvoice?.tenantName || currentRoomData.tenantName || "",
      date: currentInvoice?.date || currentDateRef.current,
    };

    const savedF = currentInvoice
      ? {
          rentAmount:
            currentInvoice.rentAmount ??
            fmtVND(currentRoomData.defaultRent || 0),
          trashUnit:
            currentInvoice.trashUnit ??
            fmtVND(currentRoomData.defaultTrash || 15000),
          elecOld: digits(currentInvoice.elecOld),
          elecNew: digits(currentInvoice.elecNew),
          elecUnit: currentInvoice.elecUnit ?? "3.200",
          waterOld: digits(currentInvoice.waterOld),
          waterNew: digits(currentInvoice.waterNew),
          waterUnit: currentInvoice.waterUnit ?? "12.000",
          paid: currentInvoice.paid ?? "",
        }
      : {
          rentAmount: fmtVND(currentRoomData.defaultRent || 0),
          trashUnit: fmtVND(currentRoomData.defaultTrash || 15000),
          elecOld: prevInvoice?.elecNew ? digits(prevInvoice.elecNew) : "",
          elecNew: "",
          elecUnit: prevInvoice?.elecUnit ?? "3.200",
          waterOld: prevInvoice?.waterNew ? digits(prevInvoice.waterNew) : "",
          waterNew: "",
          waterUnit: prevInvoice?.waterUnit ?? "12.000",
          paid: "",
        };

    const savedSnapshot = JSON.stringify({
      meta: savedMeta,
      f: savedF,
      year,
      month,
      roomId,
      blockId,
    });

    const hasDraft = draft?.meta && draft?.f;

    const nextMeta = hasDraft ? draft.meta : savedMeta;
    const nextF = hasDraft ? draft.f : savedF;

    const timer = window.setTimeout(() => {
      setMeta((prev) => ({
        ...prev,
        room: nextMeta.room || prev.room,
        tenant: nextMeta.tenant || prev.tenant,
        date: nextMeta.date || prev.date,
      }));

      const { y, m } = splitISO(nextMeta.date || currentDateRef.current);

      if (m) setMonthText(m);
      if (y) setYearText(y);

      setRoomText(nextMeta.room || currentRoomData.roomName || "");
      setF(nextF);
      setLastSavedSnapshot(savedSnapshot);
      hasHydratedRef.current = true;
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [blockId, roomId, getFreshRoomData, year, month]);

  useEffect(() => {
    if (!hasHydratedRef.current) return;
    if (!blockId || !roomId || !year || !month) return;
    if (!lastSavedSnapshot) return;

    const currentSnapshot = buildSnapshot();

    if (currentSnapshot === lastSavedSnapshot) {
      clearInvoiceDraft(blockId, roomId, year, month);
      return;
    }

    saveInvoiceDraft(blockId, roomId, year, month, {
      meta,
      f,
      year: Number(year),
      month: Number(month),
    });
  }, [blockId, roomId, year, month, meta, f, lastSavedSnapshot, buildSnapshot]);

  const applyPrevOld = () => {
    if (!year || !month) return;

    const currentRoomData = getFreshRoomData();
    if (!currentRoomData) return;

    const prev = getPreviousInvoice(
      currentRoomData,
      Number(year),
      Number(month)
    );

    if (!prev) return;

    setF((s) => ({
      ...s,
      elecOld: prev.elecNew ? digits(prev.elecNew) : s.elecOld,
      waterOld: prev.waterNew ? digits(prev.waterNew) : s.waterOld,
    }));
  };

  const resetNumbers = () => {
    const currentRoomData = getFreshRoomData();

    setF((s) => ({
      ...s,
      rentAmount: fmtVND(currentRoomData?.defaultRent || 0),
      elecOld: "",
      elecNew: "",
      waterOld: "",
      waterNew: "",
      paid: "",
      trashUnit: fmtVND(currentRoomData?.defaultTrash || 15000),
      elecUnit: "3.200",
      waterUnit: "12.000",
    }));
  };

  const doPrint = () => {
    window.print();
  };

  const currentSnapshot = buildSnapshot();
  const isDirty =
    lastSavedSnapshot !== null && currentSnapshot !== lastSavedSnapshot;

  useEffect(() => {
    if (typeof onDirtyChange === "function") {
      onDirtyChange(isDirty);
    }
  }, [isDirty, onDirtyChange]);

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
      paid: f.paid,
      updatedAt: Date.now(),
    };

    upsertInvoiceForRoom(blockId, roomId, invoicePayload);

    updateRoomInfo(blockId, roomId, {
      roomName: meta.room,
      tenantName: meta.tenant,
      defaultRent: parseMoney(f.rentAmount),
      defaultTrash: parseMoney(f.trashUnit),
    });

    clearInvoiceDraft(blockId, roomId, year, month);

    const snapshotAfterSave = JSON.stringify({
      meta,
      f,
      year,
      month,
      roomId,
      blockId,
    });

    setLastSavedSnapshot(snapshotAfterSave);
    setSaveMessage("Đã lưu phiếu thành công.");

    setTimeout(() => {
      setSaveMessage("");
    }, 1800);

    return true;
  }, [blockId, roomId, year, month, meta, f]);

  useEffect(() => {
    if (typeof registerSaveHandler === "function") {
      registerSaveHandler(handleSave);
    }
  }, [registerSaveHandler, handleSave]);

  return (
    <>
      {saveMessage && (
        <div className="save-toast no-print" role="status">
          ✅ Đã lưu phiếu thành công.
        </div>
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

          <div className="sectionTitle">Tổng</div>

          <div className="summary">
            <div className="note no-print">
              1) Nhập Phòng + Tháng → số cũ tự lấy tháng trước nếu có.
              <br />
              2) Nhập số mới → tự tính tiền.
              <br />
              3) Bấm Lưu để ghi vào lịch sử.
            </div>

            <div className="totals">
              <div className="row total">
                <div className="k">TỔNG CỘNG:</div>
                <div className="v">{fmtVND(calc.total)} VND</div>
              </div>

              <div className="row">
                <div className="k">ĐÃ TRẢ:</div>
                <div className="v-input">
                  <input
                    className="cell-input money"
                    value={f.paid}
                    onChange={setMoneyField("paid")}
                    inputMode="numeric"
                    placeholder="0"
                  />
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
