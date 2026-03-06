import Invoice from "../components/Invoice";
import "../styles/invoice.css";

export default function InvoicePage() {
  // Bọc .page để UI không bị tràn và canh lề đúng theo invoice.css
  return (
    <div className="page">
      <Invoice />
    </div>
  );
}
