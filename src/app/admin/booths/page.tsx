import { getBooths } from "./actions";
import BoothsManager from "./BoothsManager";

export default async function BoothsPage() {
  const booths = await getBooths();
  return <BoothsManager booths={booths} />;
}
