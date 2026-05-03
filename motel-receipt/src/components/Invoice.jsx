import { useCallback, useEffect, useMemo, useState } from "react";
import "../styles/invoice.css";
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

  return {
    meta,
    f,
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
      meta: initialState.meta,
      f: initialState.f,
      year: splitISO(initialState.meta.date).y,
      month: splitISO(initialState.meta.date).m,
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
    if (!year || !month) return;

    const freshRoom = findFreshRoom(blockId, roomId, roomData);
    if (!freshRoom) return;

    const prev = getPreviousInvoice(freshRoom, Number(year), Number(month));
    if (!prev) return;

    setF((s) => ({
      ...s,
      elecOld: prev.elecNew ? digits(prev.elecNew) : s.elecOld,
      waterOld: prev.waterNew ? digits(prev.waterNew) : s.waterOld,
      previousDebt: fmtVND(getInvoiceDebt(prev)),
    }));
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
      setSaveMessage("Đang lưu phiếu...");

      await upsertInvoiceOnServer({
        blockId,
        roomId,
        invoicePayload,
        roomUpdates,
      });

      const refreshedData = await loadDataFromSupabase();
      saveData(refreshedData);

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
    } catch (error) {
      console.error("Save invoice error:", error);
      setSaveMessage(error.message || "Không thể lưu phiếu.");

      setTimeout(() => {
        setSaveMessage("");
      }, 2400);

      return false;
    }
  }, [blockId, roomId, year, month, meta, f, calc]);

  useEffect(() => {
    if (typeof registerSaveHandler === "function") {
      registerSaveHandler(handleSave);
    }
  }, [registerSaveHandler, handleSave]);

  return (
    <>
      {saveMessage && (
        <div className="save-toast no-print" role="status">
          {saveMessage === "Đã lưu phiếu thành công."
            ? "✅ Đã lưu phiếu thành công."
            : saveMessage}
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
