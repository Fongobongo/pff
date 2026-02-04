import NflPageShell from "../_components/NflPageShell";
import NflPlaceholder from "../_components/NflPlaceholder";

export default function NflPortfolioPage() {
  return (
    <NflPageShell title="NFL portfolio" description="Wallet holdings for NFL players (shell).">
      <NflPlaceholder
        title="Portfolio view is not wired yet"
        items={[
          "Wallet-based holdings and PnL.",
          "Price per share and current valuation.",
          "Links to token detail history.",
        ]}
      />
    </NflPageShell>
  );
}
