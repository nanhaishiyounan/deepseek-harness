import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { crmRoutes } from "./routes";

/**
 * Cross-module jumps out of a detail drawer. `useOpenContextualChild` only
 * reaches surfaces nested under the current route, so record links that leave
 * the module navigate to the absolute resource route instead.
 */
export function useOpenRecord() {
  const navigate = useNavigate();
  return {
    customer: (id: string | number) =>
      navigate(`${crmRoutes.customers}/show/${id}`),
    deal: (id: string | number) => navigate(`${crmRoutes.pipeline}/show/${id}`),
    quote: (id: string | number) => navigate(`${crmRoutes.quotes}/show/${id}`),
    lead: (id: string | number) => navigate(`${crmRoutes.leads}/show/${id}`),
    activity: (id: string | number) =>
      navigate(`${crmRoutes.activities}/show/${id}`),
    followUp: (id: string | number) =>
      navigate(`${crmRoutes.followUps}/show/${id}`),
  };
}

export function RecordLink({
  label,
  onClick,
}: {
  label: string | null | undefined;
  onClick: () => void;
}) {
  if (!label) return <span>—</span>;
  return (
    <Button
      variant="link"
      className="h-auto p-0 text-sm font-medium"
      onClick={onClick}
    >
      {label}
    </Button>
  );
}
