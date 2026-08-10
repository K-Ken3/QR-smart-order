import { SourceType } from '../enums/source-type.enum';
import { ServiceType } from '../enums/service-type.enum';
import { RequestStatus } from '../enums/request-status.enum';

export interface CreateRequestDto {
  source_type: SourceType;
  location_id: string;
  service_type: ServiceType;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface RequestDto {
  id: string;
  tenantId: string;
  branchId: string;
  locationId: string;
  sourceType: SourceType;
  serviceType: ServiceType;
  status: RequestStatus;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  notes: string | null;
  assignedToId: string | null;
  assignedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssignRequestDto {
  employeeId: string;
}

export interface UpdateRequestStatusDto {
  status: RequestStatus.IN_PROGRESS | RequestStatus.COMPLETED;
}

export interface AddRequestNoteDto {
  note: string;
}
