import NflPageShell from "../_components/NflPageShell";
import NflPortfolioClient from "./Client";

export default async function NflPortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ address?: string }>;
}) {
  const params = await searchParams;

  return (
    <NflPageShell
      title="NFL portfolio"
      description="Input wallet address and inspect an embedded NFL-only on-chain dashboard."
    >
      <section className="mt-6">
        <NflPortfolioClient initialAddress={params.address?.trim()} />
      </section>
    </NflPageShell>
  );
}
