import { redirect } from "next/navigation";

type PlayerAliasPageProps = {
  params: Promise<{ playerId: string }>;
};

export default async function PlayerAliasPage({ params }: PlayerAliasPageProps) {
  const { playerId } = await params;
  redirect(`/nfl/player/${encodeURIComponent(playerId)}`);
}
