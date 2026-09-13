import { Navigate } from "react-router-dom";
import { PlayScreen } from "../game/screens/PlayScreen";
import { ResultScreen } from "../game/screens/ResultScreen";
import { useGameStore } from "../game/stores";

export default function PublicLabGameApp() {
  const screen = useGameStore((state) => state.screen);

  if (screen === "play") return <PlayScreen />;
  if (screen === "result") return <ResultScreen />;

  return <Navigate to="/lab/judgment-playtest" replace />;
}
