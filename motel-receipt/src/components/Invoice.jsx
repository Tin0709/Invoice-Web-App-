import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../styles/invoice.css";
import {
  getInvoiceByPeriod,
  getPreviousInvoice,
  updateRoomInfo,
  upsertInvoiceForRoom,
} from "../utils/storage";

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

/* =========================
   Child blocks
========================= */
function MetersBlock({
  compact = false,
  f,
  calc,
  setDigitsField,
  setMoneyField,
  applyPrevOld,
}) {
  return (
    <>
      <div className="sectionTitleRow">
        <div className="sectionTitle">Chỉ số điện & nước</div>
        <button className="btn tiny" type="button" onClick={applyPrevOld}>
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

      {compact && (
        <div className="miniTotals">
          <div className="miniBox">
            <div className="k">Tiền điện</div>
            <div className="v">{fmtVND(calc.elecAmount)}</div>
          </div>
          <div className="miniBox">
            <div className="k">Tiền nước</div>
            <div className="v">{fmtVND(calc.waterAmount)}</div>
          </div>
          <div className="miniBox">
            <div className="k">Tổng điện + nước</div>
            <div className="v">
              {fmtVND(calc.elecAmount + calc.waterAmount)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TrashBlock({ f, setMoneyField }) {
  return (
    <>
      <div className="sectionTitle">Tiền rác</div>
      <div className="feesGrid">
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
  onDirtyChange,
  registerSaveHandler,
}) {
  const [view, setView] = useState("invoice");

  const [meta, setMeta] = useState(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    return {
      room: roomData?.roomName || "",
      tenant: roomData?.tenantName || "",
      date: `${yyyy}-${mm}-${dd}`,
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

  const isHydratingRef = useRef(false);
  const lastHydratedKeyRef = useRef("");

  useEffect(() => {
    if (!blockId || !roomId || !roomData || !year || !month) return;

    const hydrateKey = `${roomId}:${year}-${month}`;
    if (lastHydratedKeyRef.current === hydrateKey) return;
    lastHydratedKeyRef.current = hydrateKey;

    const currentInvoice = getInvoiceByPeriod(roomData, year, month);
    const prevInvoice = getPreviousInvoice(roomData, year, month);

    const hydratedMeta = {
      room: roomData.roomName || "",
      tenant: currentInvoice?.tenantName || roomData.tenantName || "",
      date: meta.date,
    };

    const hydratedF = currentInvoice
      ? {
          rentAmount:
            currentInvoice.rentAmount ?? fmtVND(roomData.defaultRent || 0),
          trashUnit:
            currentInvoice.trashUnit ?? fmtVND(roomData.defaultTrash || 15000),
          elecOld: digits(currentInvoice.elecOld),
          elecNew: digits(currentInvoice.elecNew),
          elecUnit: currentInvoice.elecUnit ?? "3.200",
          waterOld: digits(currentInvoice.waterOld),
          waterNew: digits(currentInvoice.waterNew),
          waterUnit: currentInvoice.waterUnit ?? "12.000",
          paid: currentInvoice.paid ?? "",
        }
      : {
          rentAmount: fmtVND(roomData.defaultRent || 0),
          trashUnit: fmtVND(roomData.defaultTrash || 15000),
          elecOld: prevInvoice?.elecNew ? digits(prevInvoice.elecNew) : "",
          elecNew: "",
          elecUnit: prevInvoice?.elecUnit ?? "3.200",
          waterOld: prevInvoice?.waterNew ? digits(prevInvoice.waterNew) : "",
          waterNew: "",
          waterUnit: prevInvoice?.waterUnit ?? "12.000",
          paid: "",
        };

    isHydratingRef.current = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMeta((prev) => ({
      ...prev,
      room: hydratedMeta.room || prev.room,
      tenant: hydratedMeta.tenant || prev.tenant,
    }));

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRoomText(roomData.roomName || "");

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setF(hydratedF);

    const nextSnapshot = JSON.stringify({
      meta: hydratedMeta,
      f: hydratedF,
      year,
      month,
      roomId,
      blockId,
    });

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLastSavedSnapshot(nextSnapshot);

    const timer = setTimeout(() => {
      isHydratingRef.current = false;
    }, 0);

    return () => clearTimeout(timer);
  }, [blockId, roomId, roomData, year, month, meta.date]);

  const applyPrevOld = () => {
    if (!roomData || !year || !month) return;
    const prev = getPreviousInvoice(roomData, year, month);
    if (!prev) return;

    setF((s) => ({
      ...s,
      elecOld: prev.elecNew ? digits(prev.elecNew) : s.elecOld,
      waterOld: prev.waterNew ? digits(prev.waterNew) : s.waterOld,
    }));
  };

  const resetNumbers = () => {
    setF((s) => ({
      ...s,
      rentAmount: fmtVND(roomData?.defaultRent || 0),
      elecOld: "",
      elecNew: "",
      waterOld: "",
      waterNew: "",
      paid: "",
      trashUnit: fmtVND(roomData?.defaultTrash || 15000),
      elecUnit: "3.200",
      waterUnit: "12.000",
    }));
  };

  const doPrint = () => {
    if (view !== "invoice") {
      setView("invoice");
      setTimeout(() => window.print(), 60);
      return;
    }
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
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const handleSave = useCallback(async () => {
    if (!blockId || !roomId || !year || !month) return false;

    upsertInvoiceForRoom(blockId, roomId, {
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
    });

    updateRoomInfo(blockId, roomId, {
      roomName: meta.room,
      tenantName: meta.tenant,
      defaultRent: parseMoney(f.rentAmount),
      defaultTrash: parseMoney(f.trashUnit),
    });

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
      registerSaveHandler(() => handleSave);
    }
  }, [registerSaveHandler, handleSave]);

  return (
    <>
      <div className="topbar">
        <div className="chip">
          <span className="dot" />
          <b>Quản lý thu tiền</b>
          <span className="chip-muted">— (v6)</span>
        </div>

        <div className="actions">
          {saveMessage && <div className="save-badge">{saveMessage}</div>}

          <button className="btn success" type="button" onClick={handleSave}>
            💾 Lưu
          </button>

          <button className="btn" type="button" onClick={resetNumbers}>
            ↺ Reset
          </button>

          <button className="btn primary" type="button" onClick={doPrint}>
            🖨️ In / PDF
          </button>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Chuyển màn">
        <button
          type="button"
          className={`tabBtn ${view === "invoice" ? "active" : ""}`}
          onClick={() => setView("invoice")}
        >
          Phiếu thu
        </button>

        <button
          type="button"
          className={`tabBtn ${view === "meters" ? "active" : ""}`}
          onClick={() => setView("meters")}
        >
          Điện & Nước
        </button>

        <button
          type="button"
          className={`tabBtn ${view === "trash" ? "active" : ""}`}
          onClick={() => setView("trash")}
        >
          Tiền rác
        </button>
      </div>

      <section className="invoice" aria-label="Phiếu thu">
        <header className="invoice-header">
          <div className="title">
            {view === "meters"
              ? "BẢNG ĐIỆN & NƯỚC"
              : view === "trash"
              ? "BẢNG TIỀN RÁC"
              : "PHIẾU THU TIỀN PHÒNG TRỌ"}
          </div>

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
          {view === "meters" && (
            <MetersBlock
              compact
              f={f}
              calc={calc}
              setDigitsField={setDigitsField}
              setMoneyField={setMoneyField}
              applyPrevOld={applyPrevOld}
            />
          )}

          {view === "trash" && (
            <TrashBlock f={f} setMoneyField={setMoneyField} />
          )}

          {view === "invoice" && (
            <>
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
                <div className="note">
                  1) Nhập Phòng + Tháng → số cũ tự lấy tháng trước (nếu có).
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

              <footer className="invoice-footer">
                <div>Dữ liệu chỉ vào lịch sử sau khi bấm Lưu.</div>
                <div>
                  Phòng {meta.room || "—"} •{" "}
                  {year && month ? `${year}-${month}` : "—"}
                </div>
              </footer>
            </>
          )}
        </div>
      </section>
    </>
  );
}
