import { useNavigate, useSearchParams } from "react-router-dom";
import MenuBrowser from "../order/MenuBrowser";

export default function MenuPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  return (
    <MenuBrowser
      onBuildBowl={() => navigate("/order")}
      onGoToCart={() => navigate("/summary")}
      initialComboId={searchParams.get("select")}
    />
  );
}
