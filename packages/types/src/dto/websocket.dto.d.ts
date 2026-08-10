import { RequestStatus } from '../enums/request-status.enum';
import { ServiceType } from '../enums/service-type.enum';
export interface WsRequestCreatedPayload {
    requestId: string;
    locationName: string;
    serviceType: ServiceType;
    status: RequestStatus;
    createdAt: string;
}
export interface WsRequestAssignedPayload {
    requestId: string;
    employeeName: string;
    status: RequestStatus;
}
export interface WsRequestStatusChangedPayload {
    requestId: string;
    oldStatus: RequestStatus;
    newStatus: RequestStatus;
    timestamp: string;
}
export interface WsRequestCancelledPayload {
    requestId: string;
    cancelledAt: string;
}
export interface WsMenuItemUpdatedPayload {
    itemId: string;
    status: string;
    price: number;
}
export interface WsCatalogUpdatedPayload {
    branchId: string;
    locationType: string;
    services: Array<{
        id: string;
        name: string;
        category: string;
    }>;
}
export interface WsOrderNewPayload {
    orderId: string;
    locationName: string;
    items: Array<{
        name: string;
        quantity: number;
    }>;
    createdAt: string;
}
export interface WsEscalationPayload {
    requestId: string;
    elapsedMinutes: number;
}
//# sourceMappingURL=websocket.dto.d.ts.map