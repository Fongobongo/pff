import NflPageShell from "../_components/NflPageShell";
import NflPortfolioClient from "./Client";

export default function NflPortfolioPage() {
  return (
    <NflPageShell title="NFL portfolio" description="Track Sport.fun wallet holdings and trade history.">
      <section className="mt-6">
        <NflPortfolioClient />
      </section>
    </NflPageShell>
  );
}
