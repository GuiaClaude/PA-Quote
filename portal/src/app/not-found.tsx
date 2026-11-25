import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

/** Same message whether the page doesn't exist or belongs to another company — never hint which. */
export default function NotFound() {
  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 p-6 text-center">
      <SearchX className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-xl font-semibold">{t.common.notFound}</h1>
      <Button asChild><Link href="/">{t.nav.home}</Link></Button>
    </main>
  );
}
