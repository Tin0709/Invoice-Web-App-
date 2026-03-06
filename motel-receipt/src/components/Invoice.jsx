import { useEffect, useMemo, useRef, useState } from "react";
import "../styles/invoice.css";

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

const formatVNDate = (iso) => {
  const { y, m, d } = splitISO(iso);
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
};

const getPrevPeriod = (year, month) => {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m) return "";
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
};

/* =========================
   LocalStorage
========================= */
const makeKey = (room, period) => `motel:bill:${room}:${period}`;

const loadBill = (room, period) => {
  try {
    const raw = localStorage.getItem(makeKey(room, period));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const saveBill = (room, period, data) => {
  try {
    localStorage.setItem(makeKey(room, period), JSON.stringify(data));
  } catch {
    // ignore
  }
};

/* =========================
   Child blocks
========================= */
function MetersBlock({
  compact = false,
  f,
  calc,
  setDigitsField,
  setField,
  formatOnBlur,
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
            <div className="meterTitle">Điện</div>
            <div className="meterSub">
              Đơn giá mặc định: <b>3.200</b> / kWh
            </div>
          </div>

          <div className="meterFields">
            <div className="mf">
              <div className="mfLabel">Số cũ</div>
              <input
                className="cell-input"
                value={f.elecOld}
                onChange={setDigitsField("elecOld")}
                inputMode="numeric"
                placeholder="tự lấy tháng trước"
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
                onChange={setField("elecUnit")}
                onBlur={formatOnBlur("elecUnit")}
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
            <div className="meterTitle">Nước</div>
            <div className="meterSub">
              Đơn giá mặc định: <b>12.000</b> / m³
            </div>
          </div>

          <div className="meterFields">
            <div className="mf">
              <div className="mfLabel">Số cũ</div>
              <input
                className="cell-input"
                value={f.waterOld}
                onChange={setDigitsField("waterOld")}
                inputMode="numeric"
                placeholder="tự lấy tháng trước"
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
                onChange={setField("waterUnit")}
                onBlur={formatOnBlur("waterUnit")}
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

function TrashBlock({ f, calc, setField, formatOnBlur }) {
  return (
    <>
      <div className="sectionTitle">Tiền rác</div>
      <div className="feesGrid">
        <div className="feeRow">
          <div className="feeName">Tiền rác (mặc định 15.000, sửa được)</div>
          <div className="feeRight feeSplit">
            <input
              className="cell-input money"
              value={f.trashUnit}
              onChange={setField("trashUnit")}
              onBlur={formatOnBlur("trashUnit")}
              inputMode="numeric"
            />
            <div className="feeEquals">=</div>
            <input
              className="cell-input money"
              value={fmtVND(calc.trashAmount)}
              readOnly
            />
          </div>
        </div>
      </div>
    </>
  );
}

function FixedFeesBlock({ f, calc, setField, formatOnBlur }) {
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
              onChange={setField("rentAmount")}
              onBlur={formatOnBlur("rentAmount")}
              inputMode="numeric"
              placeholder="0"
            />
          </div>
        </div>

        <div className="feeRow">
          <div className="feeName">Tiền rác</div>
          <div className="feeRight feeSplit">
            <input
              className="cell-input money"
              value={f.trashUnit}
              onChange={setField("trashUnit")}
              onBlur={formatOnBlur("trashUnit")}
              inputMode="numeric"
            />
            <div className="feeEquals">=</div>
            <input
              className="cell-input money"
              value={fmtVND(calc.trashAmount)}
              readOnly
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
export default function Invoice() {
  const [view, setView] = useState("invoice");

  const [meta, setMeta] = useState(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return { room: "", tenant: "", date: `${yyyy}-${mm}-${dd}` };
  });

  const {
    y: year,
    m: month,
    d: day,
  } = useMemo(() => splitISO(meta.date), [meta.date]);

  const [monthText, setMonthText] = useState(month);
  const [yearText, setYearText] = useState(year);
  const [roomText, setRoomText] = useState(meta.room);

  const period = useMemo(
    () => (year && month ? `${year}-${month}` : ""),
    [year, month]
  );
  const prevPeriod = useMemo(() => getPrevPeriod(year, month), [year, month]);

  const [f, setF] = useState({
    rentAmount: "",
    trashUnit: "15000",
    elecOld: "",
    elecNew: "",
    elecUnit: "3200",
    waterOld: "",
    waterNew: "",
    waterUnit: "12000",
    paid: "",
  });

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
      trashUnit,
      trashAmount,
      elecUnit,
      elecUsed,
      elecAmount,
      waterUnit,
      waterUsed,
      waterAmount,
      total,
      paid,
      debt,
    };
  }, [f]);

  const roomKey = meta.room.trim();

  const setMetaField = (key) => (e) =>
    setMeta((s) => ({ ...s, [key]: e.target.value }));

  const setDate = (e) => setMeta((s) => ({ ...s, date: e.target.value }));

  const setField = (key) => (e) =>
    setF((s) => ({ ...s, [key]: e.target.value }));

  const setDigitsField = (key) => (e) =>
    setF((s) => ({ ...s, [key]: onlyDigits(e.target.value) }));

  const formatOnBlur = (key) => () =>
    setF((s) => ({ ...s, [key]: fmtVND(parseMoney(s[key])) }));

  const commitMonth = () => {
    const raw = onlyDigits(monthText).slice(0, 2);
    if (!raw) {
      setMonthText(month);
      return;
    }

    const mmNum = Math.min(Math.max(parseInt(raw, 10), 1), 12);
    const mm = String(mmNum).padStart(2, "0");

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
    if (!roomKey || !period) return;

    const hydrateKey = `${roomKey}:${period}`;
    if (lastHydratedKeyRef.current === hydrateKey) return;
    lastHydratedKeyRef.current = hydrateKey;

    const saved = loadBill(roomKey, period);
    const prev = prevPeriod ? loadBill(roomKey, prevPeriod) : null;

    isHydratingRef.current = true;

    Promise.resolve().then(() => {
      setF(() => {
        if (saved) {
          return {
            rentAmount: saved.rentAmount ?? "",
            trashUnit: saved.trashUnit ?? "15000",
            elecOld: digits(saved.elecOld),
            elecNew: digits(saved.elecNew),
            elecUnit: saved.elecUnit ?? "3200",
            waterOld: digits(saved.waterOld),
            waterNew: digits(saved.waterNew),
            waterUnit: saved.waterUnit ?? "12000",
            paid: saved.paid ?? "",
          };
        }

        const prevElecNew = prev?.elecNew ?? "";
        const prevWaterNew = prev?.waterNew ?? "";

        return {
          rentAmount: prev?.rentAmount ?? "",
          trashUnit: prev?.trashUnit ?? "15000",
          elecOld: prevElecNew ? digits(prevElecNew) : "",
          elecNew: "",
          elecUnit: prev?.elecUnit ?? "3200",
          waterOld: prevWaterNew ? digits(prevWaterNew) : "",
          waterNew: "",
          waterUnit: prev?.waterUnit ?? "12000",
          paid: "",
        };
      });

      if (saved?.tenant != null) {
        setMeta((m) => ({ ...m, tenant: saved.tenant ?? "" }));
      } else if (prev?.tenant) {
        setMeta((m) => ({
          ...m,
          tenant: m.tenant || prev.tenant,
        }));
      }

      setTimeout(() => {
        isHydratingRef.current = false;
      }, 0);
    });
  }, [roomKey, period, prevPeriod]);

  useEffect(() => {
    if (!roomKey || !period) return;
    if (isHydratingRef.current) return;

    saveBill(roomKey, period, {
      tenant: meta.tenant,
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
  }, [roomKey, period, meta.tenant, f]);

  const applyPrevOld = () => {
    if (!roomKey || !prevPeriod) return;
    const prev = loadBill(roomKey, prevPeriod);
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
      rentAmount: "",
      elecOld: "",
      elecNew: "",
      waterOld: "",
      waterNew: "",
      paid: "",
      trashUnit: "15000",
      elecUnit: "3200",
      waterUnit: "12000",
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

  return (
    <>
      <div className="topbar">
        <div className="chip">
          <span className="dot" />
          <b>Quản lý thu tiền</b>
          <span className="chip-muted">— (v6)</span>
        </div>

        <div className="actions">
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
            <div className="dateWrap">
              <input
                className="input"
                value={formatVNDate(meta.date)}
                readOnly
              />
              <input
                className="dateNative"
                type="date"
                value={meta.date}
                onChange={setDate}
              />
            </div>

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
              setField={setField}
              formatOnBlur={formatOnBlur}
              applyPrevOld={applyPrevOld}
            />
          )}

          {view === "trash" && (
            <TrashBlock
              f={f}
              calc={calc}
              setField={setField}
              formatOnBlur={formatOnBlur}
            />
          )}

          {view === "invoice" && (
            <>
              <FixedFeesBlock
                f={f}
                calc={calc}
                setField={setField}
                formatOnBlur={formatOnBlur}
              />

              <MetersBlock
                f={f}
                calc={calc}
                setDigitsField={setDigitsField}
                setField={setField}
                formatOnBlur={formatOnBlur}
                applyPrevOld={applyPrevOld}
              />

              <div className="sectionTitle">Tổng</div>

              <div className="summary">
                <div className="note">
                  1) Nhập Phòng + Tháng → số cũ tự lấy tháng trước (nếu có).
                  <br />
                  2) Nhập số mới → tự tính tiền.
                  <br />
                  3) Bấm In/PDF để xuất.
                </div>

                <div className="totals">
                  <div className="row total">
                    <div className="k">TỔNG CỘNG:</div>
                    <div className="v">{fmtVND(calc.total)}</div>
                  </div>

                  <div className="row">
                    <div className="k">ĐÃ TRẢ:</div>
                    <div className="v-input">
                      <input
                        className="cell-input money"
                        value={f.paid}
                        onChange={setField("paid")}
                        onBlur={formatOnBlur("paid")}
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
                <div>Dữ liệu đang lưu tạm trong máy (localStorage).</div>
                <div>
                  Phòng {meta.room || "—"} • {period || "—"}
                </div>
              </footer>
            </>
          )}
        </div>
      </section>
    </>
  );
}
