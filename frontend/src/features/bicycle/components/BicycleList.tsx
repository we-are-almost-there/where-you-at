import type { BicycleFacility } from "../types";
import { BicycleCard } from "./BicycleCard";

interface Props {
  facilities: BicycleFacility[];
  variant?: "standard" | "realtime";
}

export function BicycleList({ facilities, variant = "standard" }: Props) {
  if (facilities.length === 0) {
    return (
      <p className="py-16 text-center text-[14px] text-caption">
        조건에 맞는 자전거 시설이 없어요.
      </p>
    );
  }

  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {facilities.map((facility) => (
        <BicycleCard key={facility.id} facility={facility} variant={variant} />
      ))}
    </div>
  );
}
