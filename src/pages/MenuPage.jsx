import { useNavigate } from "react-router-dom";
import MenuBrowser from "../order/MenuBrowser";

export default function MenuPage() {
  const navigate = useNavigate();

  return (
    <MenuBrowser
      onBuildBowl={() => navigate("/order")}
      onGoToCart={() => navigate("/summary")}
    />
  );
}