import type { BicycleFacility } from "../types";
import { BicycleCard } from "./BicycleCard";

interface Props {
  facilities: BicycleFacility[];
}

export function BicycleList({ facilities }: Props) {
  if (facilities.length === 0) {
    return (
      <p className="py-16 text-center text-[14px] text-caption">
        조건에 맞는 자전거 시설이 없어요.
      </p>
    );
  }

  return (
    <div className="grid max-w-[960px] gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
      {facilities.map((facility) => (
        <BicycleCard key={facility.id} facility={facility} />
      ))}
    </div>
  );
}
