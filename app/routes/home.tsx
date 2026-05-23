import { Navigate } from "react-router";
import { Loader2 } from "lucide-react";
import { useSession } from "~/lib/auth-client";

export function meta() {
  return [{ title: "Adila Workflows" }];
}

export default function Home() {
  const { data, isPending } = useSession();

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <Navigate to={data?.session ? "/dashboard" : "/auth"} replace />;
}
