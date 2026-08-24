import { permanentRedirect } from "next/navigation";

export default function LegacyBatteryCheckPage() {
  permanentRedirect("/contents/battery-check-before-replace");
}
