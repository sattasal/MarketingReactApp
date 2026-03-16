import { useState, useEffect } from "react";
import MarketingCostsPage from "./pages/MarketingCostsPage";
import CollettivePage from "./pages/CollettivePage";
import PianiExtraPage from "./pages/PianiExtraPage";
import OOHDetailPage from "./pages/OOHDetailPage";
import TimelinePage from "./pages/TimelinePage";
import CreativitaPage from "./pages/CreativitaPage";
import LeadContrattiPage from "./pages/LeadContrattiPage";
import BudgetPage from "./pages/BudgetPage";
import ReachPage from "./pages/ReachPage";
import { PageType } from "./lib/types";

export default function App() {
  const validPages: PageType[] = ["marketing", "collettive", "piani-extra", "ooh", "timeline", "creativita", "lead-contratti", "budget", "reach"];
  
  const getPageFromHash = (): PageType => {
    const h = window.location.hash.replace("#", "") as PageType;
    return validPages.includes(h) ? h : "marketing";
  };
  
  const [page, setPage] = useState<PageType>(getPageFromHash());
  const [unlocked, setUnlocked] = useState(() => document.cookie.split("; ").some(c => c === "mc_auth=1"));

  const handleUnlock = (v: boolean) => {
    setUnlocked(v);
    if (v) {
      document.cookie = "mc_auth=1; path=/; max-age=31536000; SameSite=Lax"; // 1 anno
    } else {
      document.cookie = "mc_auth=; path=/; max-age=0";
    }
  };

  useEffect(() => {
    const onHash = () => setPage(getPageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = (p: PageType) => {
    window.location.hash = p;
    setPage(p);
  };

  const pageProps = { onNavigate: navigate, unlocked, setUnlocked: handleUnlock };

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform: translateX(-50%) translateY(-10px); } to { opacity:1; transform: translateX(-50%) translateY(0); } }
        input, select { font-family: 'DM Sans', sans-serif; }
        input:focus, select:focus { outline: none; border-color: #3b82f6 !important; box-shadow: 0 0 0 3px rgba(59,130,246,.15) !important; }
        .row-hover:hover { background: #f1f5f9 !important; }
        .btn { cursor:pointer; border:none; font-family:'DM Sans',sans-serif; font-weight:600; transition: all .15s ease; }
        .btn:active { transform: scale(.97); }
        .btn:disabled { opacity:.5; cursor:not-allowed; }
        ::-webkit-scrollbar { height: 6px; } ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        .nav-link { cursor:pointer; padding: 8px 16px; border-radius: 8px; font-size: 14px; font-weight: 600; border: none; font-family: 'DM Sans', sans-serif; transition: all .15s ease; }
        .nav-link:hover { opacity: .85; }
        .eye-btn { background: none; border: none; cursor: pointer; font-size: 14px; padding: 2px; opacity: .5; transition: opacity .15s; }
        .eye-btn:hover { opacity: 1; }
      `}</style>
      
      {page === "marketing" && <MarketingCostsPage {...pageProps} />}
      {page === "collettive" && <CollettivePage {...pageProps} />}
      {page === "piani-extra" && <PianiExtraPage {...pageProps} />}
      {page === "ooh" && <OOHDetailPage {...pageProps} />}
      {page === "timeline" && <TimelinePage {...pageProps} />}
      {page === "creativita" && <CreativitaPage {...pageProps} />}
      {page === "lead-contratti" && <LeadContrattiPage {...pageProps} />}
      {page === "budget" && <BudgetPage {...pageProps} />}
      {page === "reach" && <ReachPage {...pageProps} />}
    </>
  );
}
