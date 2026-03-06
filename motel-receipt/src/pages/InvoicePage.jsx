import { useMemo, useState } from "react";
import "../styles/invoice.css";

/* =========================
   Money helpers
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

/* =========================
   Date helpers (month/year/date sync)
========================= */
const onlyDigits = (v) => String(v ?? "").replace(/[^\d]/g, "");

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
  return new Date(y, m, 0).getDate(); // month: 1-12
};

const formatVNDate = (iso) => {
  const { y, m, d } = splitISO(iso);
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
};

export default function Invoice() {
  // meta: date là nguồn chính
  const [meta, setMeta] = useState(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return {
      room: "",
      tenant: "",
      date: `${yyyy}-${mm}-${dd}`,
    };
  });

  const {
    y: year,
    m: month,
    d: day,
  } = useMemo(() => splitISO(meta.date), [meta.date]);

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

  const setMetaField = (key) => (e) =>
    setMeta((s) => ({ ...s, [key]: e.target.value }));
  const setField = (key) => (e) =>
    setF((s) => ({ ...s, [key]: e.target.value }));

  const formatOnBlur = (key) => () =>
    setF((s) => ({ ...s, [key]: fmtVND(parseMoney(s[key])) }));

  // month/year edits -> update meta.date
  const setMonth = (e) => {
    const raw = onlyDigits(e.target.value).slice(0, 2);
    if (!raw) return;
    const mm = String(Math.min(Math.max(parseInt(raw, 10), 1), 12)).padStart(
      2,
      "0"
    );

    const baseYear = year || String(new Date().getFullYear());
    const maxD = daysInMonth(baseYear, mm);
    const dd = String(Math.min(Number(day || 1), maxD)).padStart(2, "0");

    setMeta((s) => ({ ...s, date: toISODate(baseYear, mm, dd) }));
  };

  const setYear = (e) => {
    const raw = onlyDigits(e.target.value).slice(0, 4);
    if (!raw) return;
    const yyyy = raw.padStart(4, "0");

    const baseMonth = month || "01";
    const maxD = daysInMonth(yyyy, baseMonth);
    const dd = String(Math.min(Number(day || 1), maxD)).padStart(2, "0");

    setMeta((s) => ({ ...s, date: toISODate(yyyy, baseMonth, dd) }));
  };

  const setDate = (e) => setMeta((s) => ({ ...s, date: e.target.value }));

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

  return (
    <>
      <div className="topbar">
        <div className="chip">
          <span className="dot" />
          <b>Phiếu thu (demo React)</b>
          <span className="chip-muted">— bấm “In/PDF” để xuất PDF</span>
        </div>

        <div className="actions">
          <button className="btn" type="button" onClick={resetNumbers}>
            ↺ Reset
          </button>
          <button
            className="btn primary"
            type="button"
            onClick={() => window.print()}
          >
            🖨️ In / PDF
          </button>
        </div>
      </div>

      <section className="invoice" aria-label="Phiếu thu tiền phòng trọ">
        <header className="invoice-header">
          <div className="title">PHIẾU THU TIỀN PHÒNG TRỌ</div>

          {/* ✅ NEW: 4-column meta grid (desktop) giống Excel, không lệch */}
          <div className="metaGrid">
            <div className="mLabel">Tháng:</div>
            <input
              className="input"
              value={month}
              onChange={setMonth}
              inputMode="numeric"
              placeholder="VD: 03"
            />

            <div className="mLabel">Năm:</div>
            <input
              className="input"
              value={year}
              onChange={setYear}
              inputMode="numeric"
              placeholder="VD: 2026"
            />

            <div className="mLabel">Phòng số:</div>
            <input
              className="input"
              value={meta.room}
              onChange={setMetaField("room")}
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
          <div className="table">
            <div className="t-head">
              <div>Nội dung</div>
              <div className="right">Số cũ</div>
              <div className="right">Số mới</div>
              <div className="right">Sử dụng</div>
              <div className="right">Đơn giá (VND)</div>
              <div className="right">Thành tiền (VND)</div>
            </div>

            <div className="t-row">
              <div>
                <b>Tiền phòng</b>
              </div>
              <div className="right">
                <input className="cell-input" disabled value="-" />
              </div>
              <div className="right">
                <input className="cell-input" disabled value="-" />
              </div>
              <div className="right">
                <input className="cell-input" disabled value="-" />
              </div>
              <div className="right">
                <input className="cell-input" disabled value="-" />
              </div>
              <div className="right">
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

            <div className="t-row">
              <div>
                <b>Tiền rác</b>
              </div>
              <div className="right">
                <input className="cell-input" disabled value="-" />
              </div>
              <div className="right">
                <input className="cell-input" disabled value="-" />
              </div>
              <div className="right">
                <input className="cell-input" disabled value="-" />
              </div>
              <div className="right">
                <input
                  className="cell-input money"
                  value={f.trashUnit}
                  onChange={setField("trashUnit")}
                  onBlur={formatOnBlur("trashUnit")}
                  inputMode="numeric"
                />
              </div>
              <div className="right">
                <input
                  className="cell-input money"
                  value={fmtVND(parseMoney(f.trashUnit))}
                  readOnly
                />
              </div>
            </div>

            <div className="t-row">
              <div>
                <b>Tiền điện</b>
              </div>
              <div className="right">
                <input
                  className="cell-input money"
                  value={f.elecOld}
                  onChange={setField("elecOld")}
                  onBlur={formatOnBlur("elecOld")}
                  inputMode="numeric"
                  placeholder="0"
                />
              </div>
              <div className="right">
                <input
                  className="cell-input money"
                  value={f.elecNew}
                  onChange={setField("elecNew")}
                  onBlur={formatOnBlur("elecNew")}
                  inputMode="numeric"
                  placeholder="0"
                />
              </div>
              <div className="right">
                <input
                  className="cell-input money"
                  value={fmtVND(calc.elecUsed)}
                  readOnly
                />
              </div>
              <div className="right">
                <input
                  className="cell-input money"
                  value={f.elecUnit}
                  onChange={setField("elecUnit")}
                  onBlur={formatOnBlur("elecUnit")}
                  inputMode="numeric"
                />
              </div>
              <div className="right">
                <input
                  className="cell-input money"
                  value={fmtVND(calc.elecAmount)}
                  readOnly
                />
              </div>
            </div>

            <div className="t-row">
              <div>
                <b>Tiền nước</b>
              </div>
              <div className="right">
                <input
                  className="cell-input money"
                  value={f.waterOld}
                  onChange={setField("waterOld")}
                  onBlur={formatOnBlur("waterOld")}
                  inputMode="numeric"
                  placeholder="0"
                />
              </div>
              <div className="right">
                <input
                  className="cell-input money"
                  value={f.waterNew}
                  onChange={setField("waterNew")}
                  onBlur={formatOnBlur("waterNew")}
                  inputMode="numeric"
                  placeholder="0"
                />
              </div>
              <div className="right">
                <input
                  className="cell-input money"
                  value={fmtVND(calc.waterUsed)}
                  readOnly
                />
              </div>
              <div className="right">
                <input
                  className="cell-input money"
                  value={f.waterUnit}
                  onChange={setField("waterUnit")}
                  onBlur={formatOnBlur("waterUnit")}
                  inputMode="numeric"
                />
              </div>
              <div className="right">
                <input
                  className="cell-input money"
                  value={fmtVND(calc.waterAmount)}
                  readOnly
                />
              </div>
            </div>
          </div>

          <div className="summary">
            <div className="note">
              <b>Gợi ý dùng (cho mẹ):</b>
              <br />
              1) Nhập <b>số mới</b> điện/nước → tự tính “sử dụng” và “thành
              tiền”.
              <br />
              2) Nhập <b>đã trả</b> → xem “còn thiếu”.
              <br />
              3) Bấm <b>In/PDF</b> để xuất hóa đơn.
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
        </div>

        <footer className="invoice-footer">
          <div>
            Ghi chú: sau này có thể thêm nhiều “Style” (theme) trong Settings.
          </div>
          <div>Phiếu thu — bản React</div>
        </footer>
      </section>
    </>
  );
}
