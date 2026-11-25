import { redirect } from "next/navigation";
/** Reorder starts from the client’s Print Items (each has a Reorder button). */
export default function ReorderStart() {
  redirect("/app/items");
}
