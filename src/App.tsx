// src/App.tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Dashboard } from "@/pages/Dashboard";

function NotFound() {
  return (
    <div className="flex items-center justify-center h-full bg-sx-bg">
      <div className="text-center space-y-4">
        <div className="font-mono text-sx-red text-6xl">404</div>
        <div className="font-mono text-sx-cyan tracking-widest text-xl">ROUTE NOT FOUND</div>
        <div className="font-mono text-sx-text-muted text-sm">SENTINEL-X // NAVIGATION ERROR</div>
        <a href="/" className="inline-block mt-4 font-mono text-sx-cyan border border-sx-cyan/40 px-4 py-2 rounded hover:bg-sx-cyan/10 transition-colors">
          ← RETURN TO OPERATIONS CENTER
        </a>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
