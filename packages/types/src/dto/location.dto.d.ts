import { LocationType } from '../enums/location-type.enum';
import { LocationStatus } from '../enums/location-status.enum';
export interface CreateLocationDto {
    name: string;
    locationType: LocationType;
    floor?: string;
    zone?: string;
}
export interface UpdateLocationDto {
    name?: string;
    floor?: string;
    zone?: string;
    status?: LocationStatus;
}
export interface LocationDto {
    id: string;
    branchId: string;
    name: string;
    locationType: LocationType;
    floor: string | null;
    zone: string | null;
    status: LocationStatus;
    createdAt: Date;
}
//# sourceMappingURL=location.dto.d.ts.map