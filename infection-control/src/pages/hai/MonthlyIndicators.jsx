import { Navigate } from "react-router-dom";
import { useAuth } from "../../lib/auth.jsx";
import { useLanguage } from "../../lib/i18n.jsx";
import MonthlyIndicatorsTab from "../../components/hai/MonthlyIndicatorsTab";

// A separate sidebar page (not a HaiSurveillance tab) for the hospital's
// monthly IPC/HAI indicator sheet — hand hygiene, device-day rates, bundle
// compliance, surgery counts. Hospital-wide, so hidden for a doctor account
// scoped to a single unit/SSI (same rule HaiSurveillance applies to its own
// hospital-wide tabs).
export default function MonthlyIndicators() {
  const { session, isAdmin } = useAuth();
  const { t } = useLanguage();

  if (!isAdmin && session?.haiScope) return <Navigate to="/hai-surveillance" replace />;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t("Monthly IPC Indicator")}</h1>
        <p className="text-sm text-slate-500">{t("Hand hygiene, device-associated infection rates, bundle compliance and surgery counts, by month.")}</p>
      </div>
      <MonthlyIndicatorsTab isAdmin={isAdmin} />
    </div>
  );
}
