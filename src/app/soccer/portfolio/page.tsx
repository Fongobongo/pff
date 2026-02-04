import SoccerPageShell from "../_components/SoccerPageShell";
import SoccerPortfolioClient from "./Client";

export default function SoccerPortfolioPage() {
  return (
    <SoccerPageShell title="Soccer portfolio" description="Track Sport.fun wallet holdings and trade history.">
      <section className="mt-6">
        <SoccerPortfolioClient />
      </section>
    </SoccerPageShell>
  );
}
