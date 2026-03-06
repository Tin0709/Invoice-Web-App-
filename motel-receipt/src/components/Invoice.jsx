import { useEffect, useMemo, useRef, useState } from "react";
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
   Date helpers
========================= */
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

export default function Invoice() {
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

  const period = useMemo(
    () => (year && month ? `${year}-${month}` : ""),
    [year, month]
  );
  const prevPeriod = useMemo(() => getPrevPeriod(year, month), [year, month]);

  // ✅ Đúng theo yêu cầu:
  // - Tiền rác mặc định 15000 (sửa được)
  // - Điện mặc định 3200/kWh
  // - Nước mặc định 12000/m³
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

  const setDigitsField = (key) => (e) => {
    const val = onlyDigits(e.target.value);
    setF((s) => ({ ...s, [key]: val }));
  };

  const setField = (key) => (e) =>
    setF((s) => ({ ...s, [key]: e.target.value }));

  const formatOnBlur = (key) => () =>
    setF((s) => ({ ...s, [key]: fmtVND(parseMoney(s[key])) }));

  // Hydrate / autosave
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
      // ✅ FIX QUAN TRỌNG:
      // Nếu tháng hiện tại CHƯA có dữ liệu -> reset sạch form + tự lấy số cũ từ tháng trước
      // (tránh bị “dính số” của phòng/tháng khác)
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
          // có thể tự “kế thừa” rent/đơn giá tháng trước cho tiện dùng
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

      // tenant: nếu tháng hiện tại chưa có thì có thể lấy từ tháng trước
      if (saved?.tenant != null) {
        setMeta((m) => ({ ...m, tenant: saved.tenant ?? "" }));
      } else if (prev?.tenant && !meta.tenant) {
        setMeta((m) => ({ ...m, tenant: prev.tenant }));
      }

      setTimeout(() => {
        isHydratingRef.current = false;
      }, 0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              <div className="feeName">
                Tiền rác <span className="hint">(mặc định 15.000)</span>
              </div>
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

          <div className="sectionTitleRow">
            <div className="sectionTitle">Chỉ số điện & nước</div>
            <button
              className="btn tiny"
              type="button"
              onClick={applyPrevOld}
              title="Lấy số cũ từ tháng trước"
            >
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

          <div className="sectionTitle">Bảng tính tiền</div>

          <div className="billTable">
            <div className="billHead">
              <div>Nội dung</div>
              <div className="right">Đơn giá</div>
              <div className="right">Số lượng</div>
              <div className="right">Thành tiền</div>
            </div>

            <div className="billRow">
              <div>
                <b>Tiền phòng</b>
              </div>
              <div className="right">-</div>
              <div className="right">1</div>
              <div className="right moneyText">{fmtVND(calc.rent)}</div>
            </div>

            <div className="billRow">
              <div>
                <b>Tiền rác</b>
              </div>
              <div className="right moneyText">{fmtVND(calc.trashUnit)}</div>
              <div className="right">1</div>
              <div className="right moneyText">{fmtVND(calc.trashAmount)}</div>
            </div>

            <div className="billRow">
              <div>
                <b>Tiền điện</b>
              </div>
              <div className="right moneyText">{fmtVND(calc.elecUnit)}</div>
              <div className="right">{fmtVND(calc.elecUsed)}</div>
              <div className="right moneyText">{fmtVND(calc.elecAmount)}</div>
            </div>

            <div className="billRow">
              <div>
                <b>Tiền nước</b>
              </div>
              <div className="right moneyText">{fmtVND(calc.waterUnit)}</div>
              <div className="right">{fmtVND(calc.waterUsed)}</div>
              <div className="right moneyText">{fmtVND(calc.waterAmount)}</div>
            </div>
          </div>

          <div className="summary">
            <div className="note">
              <b>Gợi ý dùng (cho mẹ):</b>
              <br />
              1) Nhập <b>Phòng</b> + chọn <b>tháng</b> → số cũ điện/nước tự lấy
              tháng trước (nếu có).
              <br />
              2) Nhập <b>số mới</b> → tự tính “sử dụng” và “thành tiền”.
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
            Ghi chú: dữ liệu đang lưu tạm trong máy (localStorage). Sau này sẽ
            chuyển qua database để dùng nhiều thiết bị.
          </div>
          <div>Phiếu thu — bản React</div>
        </footer>
      </section>
    </>
  );
}
