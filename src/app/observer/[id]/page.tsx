import { redirect } from 'next/navigation';

// /observer is deprecated — all guest access now goes through /guest/[groupId]?token=...
export default async function ObserverRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/guest/${id}`);
}
