import { Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import InvoicePage from "./pages/InvoicePage";
import HistoryPage from "./pages/HistoryPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/invoice/:blockId/:roomId" element={<InvoicePage />} />
      <Route path="/history" element={<HistoryPage />} />
    </Routes>
  );
}
