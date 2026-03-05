// src/components/Invoice.jsx
import { useMemo, useState } from "react";
import "../styles/invoice.css";

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

export default function Invoice() {
  const [meta, setMeta] = useState(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return {
      month: mm,
      year: String(yyyy),
      room: "",
      date: `${yyyy}-${mm}-${dd}`,
      tenant: "",
    };
  });

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
      elecOld,
      elecNew,
      elecUnit,
      elecUsed,
      elecAmount,
      waterOld,
      waterNew,
      waterUnit,
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

          <div className="meta">
            <div className="field">
              <div className="label">Tháng:</div>
              <input
                className="input"
                value={meta.month}
                onChange={setMetaField("month")}
                inputMode="numeric"
                placeholder="VD: 03"
              />
            </div>

            <div className="field">
              <div className="label">Năm:</div>
              <input
                className="input"
                value={meta.year}
                onChange={setMetaField("year")}
                inputMode="numeric"
                placeholder="VD: 2026"
              />
            </div>

            <div className="field">
              <div className="label">Phòng số:</div>
              <input
                className="input"
                value={meta.room}
                onChange={setMetaField("room")}
                placeholder="VD: 101"
              />
            </div>

            <div className="field">
              <div className="label">Ngày thu:</div>
              <input
                className="input"
                type="date"
                value={meta.date}
                onChange={setMetaField("date")}
              />
            </div>

            <div className="field span-all">
              <div className="label">Tên người thuê:</div>
              <input
                className="input"
                value={meta.tenant}
                onChange={setMetaField("tenant")}
                placeholder="VD: Nguyễn Văn A"
              />
            </div>
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
                  value={fmtVND(calc.trashAmount)}
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
