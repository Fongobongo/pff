import { z } from "zod";
import SportfunPortfolioClient from "./Client";

const paramsSchema = z.object({
  address: z.string().min(1),
});

export default async function SportfunPortfolioPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = paramsSchema.parse(await params);
  return <SportfunPortfolioClient address={address} />;
}
