import { redirect } from "next/navigation";
/** Reorder starts from the client's Print Items (one-click reorder arrives in Phase 5). */
export default function ReorderStart() {
  redirect("/app/items");
}
