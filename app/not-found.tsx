import { Compass } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { ErrorScreen } from "@/components/common/error-screen";

export default function NotFound() {
  return (
    <ErrorScreen
      icon={Compass}
      accent="bg-ft-sky"
      code="404"
      title="Page not found"
      description="That link doesn't lead anywhere. It may have been renamed, or the group or expense it pointed to was deleted."
      actions={
        <>
          <ButtonLink href="/dashboard" size="lg">
            Go to dashboard
          </ButtonLink>
          <ButtonLink href="/groups" variant="secondary" size="lg">
            Browse groups
          </ButtonLink>
        </>
      }
    />
  );
}
