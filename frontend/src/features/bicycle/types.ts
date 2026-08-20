export interface BicycleFacilityRoute {
  route_type: string;
}

export interface BicycleFacility {
  id: number;
  facility_title: string;
  addr1: string;
  map_x: number;
  map_y: number;
  facility_type: string;
  rental_fee_type: string;
  repair_available: boolean | null;
  open_hours: string;
  total_bikes: number | null;
  available_bikes: number | null;
  region_code: string;
  realtime_synced_at: string | null;
}

export interface BicycleFacilityDetail extends BicycleFacility {
  open_hours: string;
  realtime_synced_at: string | null;
}

export interface BicycleFacilityListResponse {
  total_count: number;
  page: number;
  size: number;
  facilities: BicycleFacility[];
}

export interface BicycleFacilityFilterState {
  region: string;
  facilityType: string;
}
