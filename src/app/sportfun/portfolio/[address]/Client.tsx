"use client";

import SportfunPortfolioDashboard from "@/components/portfolio/SportfunPortfolioDashboard";

export default function SportfunPortfolioClient({ address }: { address: string }) {
  return (
    <SportfunPortfolioDashboard
      address={address}
      mode="sportfun"
      lockedSportFilter={null}
      showGlobalLinks
    />
  );
}
