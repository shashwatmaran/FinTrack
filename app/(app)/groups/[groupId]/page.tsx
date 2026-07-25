import { GroupDetailView } from "@/components/groups/group-detail-view";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  return <GroupDetailView groupId={groupId} />;
}
